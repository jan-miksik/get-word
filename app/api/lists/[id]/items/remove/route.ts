import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  getListItems,
  deleteItems,
  archiveProgressForItems,
  softDeleteHooksForItems,
  mergeHooksToSurvivor,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { canManageListContent } from '@/features/lists/public.server';

type RouteContext = { params: Promise<{ id: string }> };

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Removing an item is destructive on shared content (it cascade-deletes other
// learners' memory hooks for the word). So before deleting we either rewire the
// item's hooks onto a surviving duplicate twin, or soft-delete them with a
// sync tombstone — never lean on the bare FK cascade. Progress is archived, not
// hard-deleted. Order is untouched: we only delete the named rows, and items
// are read by ascending `position` with no contiguity assumption.
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;

  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canManageListContent(list, user)) {
    return forbiddenResponse("Only the list owner can modify items");
  }

  const body = await request.json();
  const itemIds: unknown = body?.itemIds;
  if (!Array.isArray(itemIds) || itemIds.some((value) => typeof value !== "string")) {
    return NextResponse.json(
      { error: "itemIds must be an array of strings" },
      { status: 400 },
    );
  }

  const removeSet = new Set(itemIds as string[]);
  if (removeSet.size === 0) {
    return NextResponse.json({ removed: [], merged: [] });
  }

  const allItems = await getListItems(id);
  const removedItems = allItems.filter((item) => removeSet.has(item.id));
  if (removedItems.length === 0) {
    return NextResponse.json({ removed: [], merged: [] });
  }
  const validRemoveIds = removedItems.map((item) => item.id);

  // Survivors = items staying in the list, keyed by their normalized word pair.
  // First occurrence wins so a stable twin is chosen.
  const survivorByKey = new Map<string, string>();
  for (const item of allItems) {
    if (removeSet.has(item.id)) continue;
    const key = `${normalize(item.textKnown)}\0${normalize(item.textTarget)}`;
    if (!survivorByKey.has(key)) survivorByKey.set(key, item.id);
  }

  const merged: { from: string; into: string }[] = [];
  for (const item of removedItems) {
    const key = `${normalize(item.textKnown)}\0${normalize(item.textTarget)}`;
    const survivorId = survivorByKey.get(key);
    if (survivorId) {
      await mergeHooksToSurvivor(item.id, survivorId);
      merged.push({ from: item.id, into: survivorId });
    } else {
      await softDeleteHooksForItems([item.id]);
    }
  }

  await archiveProgressForItems(validRemoveIds);
  await deleteItems(validRemoveIds);

  return NextResponse.json({ removed: validRemoveIds, merged });
}
