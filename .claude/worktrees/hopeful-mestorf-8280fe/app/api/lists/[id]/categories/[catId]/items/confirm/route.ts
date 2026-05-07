import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  getCategoryItems,
  createItems,
  deleteItems,
  updateItemPositions,
  archiveProgressForItems,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string; catId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id, catId } = await context.params;

  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Only the list owner can modify items");
  }

  const body = await request.json();
  const { added, removed, reordered, input_language } = body;

  if (!Array.isArray(added) || !Array.isArray(removed) || !Array.isArray(reordered)) {
    return NextResponse.json(
      { error: "added, removed, and reordered arrays are required" },
      { status: 400 },
    );
  }

  // Process removals: archive progress then delete items
  if (removed.length > 0) {
    const removedIds = removed.map((r: { id: string }) => r.id);
    await archiveProgressForItems(removedIds);
    await deleteItems(removedIds);
  }

  // Process reorders
  if (reordered.length > 0) {
    await updateItemPositions(
      reordered.map((r: { id: string; position: number }) => ({
        id: r.id,
        position: r.position,
      })),
    );
  }

  // Process additions
  if (added.length > 0) {
    // Determine starting position from existing items
    const existingItems = await getCategoryItems(id, catId);
    const maxPos = existingItems.reduce(
      (max, item) => Math.max(max, item.position),
      -1,
    );

    const isTarget = input_language === "target";
    const newItems = added.map((text: string, i: number) => ({
      listId: id,
      categoryId: catId,
      textKnown: isTarget ? "" : text,
      textTarget: isTarget ? text : null,
      position: maxPos + 1 + i,
      translationStatus: "pending" as const,
    }));

    const created = await createItems(newItems);

    return NextResponse.json({
      completed: false,
      needs_translation: true,
      pending_items: created.map((item) => ({
        id: item.id,
        text_known: item.textKnown,
        text_target: item.textTarget,
        position: item.position,
      })),
    });
  }

  // No additions — order/removal only
  return NextResponse.json({
    completed: true,
    needs_translation: false,
  });
}
