import { NextRequest, NextResponse } from "next/server";
import { getListById, getCategoryItems } from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
  isEditor,
} from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string; catId: string }> };

function canManageListContent(list: Awaited<ReturnType<typeof getListById>>, user: NonNullable<Awaited<ReturnType<typeof resolveUserFromRequest>>>) {
  return Boolean(list && (list.ownerId === user.id || (list.isCommon && isEditor(user))));
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id, catId } = await context.params;

  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canManageListContent(list, user)) {
    return forbiddenResponse("Only the list owner can modify items");
  }

  const body = await request.json();
  const { lines, input_language } = body;

  if (!Array.isArray(lines)) {
    return NextResponse.json(
      { error: "lines is required and must be an array" },
      { status: 400 },
    );
  }
  if (input_language !== "known" && input_language !== "target") {
    return NextResponse.json(
      { error: "input_language must be 'known' or 'target'" },
      { status: 400 },
    );
  }

  // Strip empty lines
  const nonEmptyLines = lines.filter(
    (line: string) => line.trim().length > 0,
  );

  // Check for duplicates (case-insensitive, normalized)
  const seen = new Map<string, number[]>();
  for (let i = 0; i < nonEmptyLines.length; i++) {
    const key = normalize(nonEmptyLines[i]);
    const existing = seen.get(key);
    if (existing) {
      existing.push(i + 1);
    } else {
      seen.set(key, [i + 1]);
    }
  }
  const duplicates = Array.from(seen.entries())
    .filter(([, lineNums]) => lineNums.length > 1)
    .map(([text, lineNums]) => ({ text, lines: lineNums }));

  if (duplicates.length > 0) {
    return NextResponse.json(
      { error: "Duplicate lines found", duplicates },
      { status: 400 },
    );
  }

  // Get current items in category (sorted by position asc)
  const currentItems = await getCategoryItems(id, catId);

  // Build lookup from current items by normalized text.
  //
  // Reordering must be judged by an item's *rank within the category*, not its
  // raw stored `position`. Stored positions can be global/sparse across the
  // whole list, so comparing them to the category-local line index would flag
  // every word as "reordered" even when the order is unchanged. `rank` counts
  // only items that have text in the input language, mirroring how the textarea
  // strips empty lines before indexing them.
  const field = input_language === "known" ? "textKnown" : "textTarget";
  const currentByText = new Map<
    string,
    { id: string; rank: number; textKnown: string; textTarget: string | null }
  >();
  let rank = 0;
  for (const item of currentItems) {
    const text = item[field];
    if (text && text.trim().length > 0) {
      currentByText.set(normalize(text), {
        id: item.id,
        rank,
        textKnown: item.textKnown,
        textTarget: item.textTarget,
      });
      rank++;
    }
  }

  // Compute diff
  const added: string[] = [];
  const addedPositions: { text: string; position: number }[] = [];
  const reordered: { id: string; text: string; from_pos: number; to_pos: number }[] = [];
  const matchedIds = new Set<string>();
  let unchanged = 0;

  for (let i = 0; i < nonEmptyLines.length; i++) {
    const lineText = nonEmptyLines[i].trim();
    const key = normalize(lineText);
    const existing = currentByText.get(key);

    if (existing) {
      matchedIds.add(existing.id);
      if (existing.rank !== i) {
        reordered.push({
          id: existing.id,
          text: lineText,
          from_pos: existing.rank,
          to_pos: i,
        });
      } else {
        unchanged++;
      }
    } else {
      added.push(lineText);
      addedPositions.push({ text: lineText, position: i });
    }
  }

  const removed = currentItems
    .filter((item) => !matchedIds.has(item.id))
    .map((item) => ({
      id: item.id,
      text_known: item.textKnown,
      text_target: item.textTarget,
    }));

  const result: Record<string, unknown> = {
    added,
    added_positions: addedPositions,
    removed,
    reordered,
    unchanged,
  };

  if (nonEmptyLines.length > 500) {
    result.warning = "Exceeded 500 items per category limit";
  }

  return NextResponse.json(result);
}
