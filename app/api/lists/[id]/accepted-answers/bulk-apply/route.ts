import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { db } from "@/lib/db/client";
import { getListById, updateItemTranslations } from "@/lib/db";
import { wordListItems } from "@/lib/db/schema";
import { normalizeAnswerExactKey } from "@/lib/answer-normalization";
import {
  AcceptedAnswersValidationError,
  MAX_ACCEPTED_ANSWERS,
  normalizeAcceptedAnswersForDisplay,
} from "@/lib/word-item-accepted-answers";

type RouteContext = { params: Promise<{ id: string }> };

type ApplyEntry = {
  item_id: string;
  known: string[];
  target: string[];
};

function parseEntries(value: unknown): ApplyEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: ApplyEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const itemId = (item as { item_id?: unknown }).item_id;
    const known = (item as { known?: unknown }).known ?? [];
    const target = (item as { target?: unknown }).target ?? [];
    if (typeof itemId !== "string" || !itemId) return null;
    if (!Array.isArray(known) || !Array.isArray(target)) return null;
    entries.push({
      item_id: itemId,
      known: known.filter((v): v is string => typeof v === "string"),
      target: target.filter((v): v is string => typeof v === "string"),
    });
  }
  return entries;
}

// Merges the selected additions into the CURRENT stored answers. The client
// sends only the picked suggestions, never whole merged arrays, so edits made
// elsewhere between preview and apply survive.
function mergeAdditions(current: string[], additions: string[], primary: string): string[] {
  const normalized = normalizeAcceptedAnswersForDisplay(current, primary);
  const seen = new Set(normalized.map((answer) => normalizeAnswerExactKey(answer)));
  const primaryKey = normalizeAnswerExactKey(primary);
  const next = [...normalized];
  for (const raw of additions) {
    const answer = raw.normalize("NFC").trim();
    if (!answer) continue;
    const key = normalizeAnswerExactKey(answer);
    if (!key || key === primaryKey || seen.has(key)) continue;
    if (next.length >= MAX_ACCEPTED_ANSWERS) break;
    seen.add(key);
    next.push(answer);
  }
  return next;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: listId } = await context.params;
  const list = await getListById(listId);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (list.ownerId !== user.id) return forbiddenResponse("Not list owner");

  const body = await request.json().catch(() => ({}));
  const entries = parseEntries(body.items);
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(wordListItems)
    .where(inArray(wordListItems.id, entries.map((entry) => entry.item_id)));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const appliedItemIds: string[] = [];
  const skippedItemIds: string[] = [];
  const updates: { id: string; acceptedKnown?: string[]; acceptedTarget?: string[] }[] = [];
  for (const entry of entries) {
    const row = rowById.get(entry.item_id);
    if (!row || row.listId !== listId) {
      skippedItemIds.push(entry.item_id);
      continue;
    }
    const update: (typeof updates)[number] = { id: entry.item_id };
    if (entry.known.length > 0 && row.textKnown.trim()) {
      update.acceptedKnown = mergeAdditions(row.acceptedKnown ?? [], entry.known, row.textKnown);
    }
    if (entry.target.length > 0 && row.textTarget?.trim()) {
      update.acceptedTarget = mergeAdditions(
        row.acceptedTarget ?? [],
        entry.target,
        row.textTarget,
      );
    }
    if (update.acceptedKnown === undefined && update.acceptedTarget === undefined) {
      skippedItemIds.push(entry.item_id);
      continue;
    }
    updates.push(update);
    appliedItemIds.push(entry.item_id);
  }

  if (updates.length > 0) {
    try {
      // Accepted-only payload: updateItemTranslations touches nothing else and
      // never trips the "text changed → clear answers" reset.
      await updateItemTranslations(updates);
    } catch (error) {
      if (error instanceof AcceptedAnswersValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  return NextResponse.json({
    applied_item_ids: appliedItemIds,
    skipped_item_ids: skippedItemIds,
    // Merged results per item so the editor can mirror the stored state. A side
    // the apply did not touch is omitted, never returned as [].
    items: updates.map((update) => ({
      item_id: update.id,
      ...(update.acceptedKnown !== undefined ? { known: update.acceptedKnown } : {}),
      ...(update.acceptedTarget !== undefined ? { target: update.acceptedTarget } : {}),
    })),
  });
}
