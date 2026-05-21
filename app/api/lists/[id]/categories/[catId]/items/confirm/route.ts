import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  createItems,
  deleteItems,
  updateItemPositions,
  archiveProgressForItems,
} from "@/lib/db";
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

export async function POST(request: NextRequest, context: RouteContext) {
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
    const addedPositions = Array.isArray(body.added_positions)
      ? body.added_positions
          .map((entry: { text?: unknown; position?: unknown }, index: number) => ({
            text: typeof entry.text === "string" ? entry.text : String(added[index] ?? ""),
            position: Number.isFinite(Number(entry.position)) ? Number(entry.position) : index,
          }))
          .filter((entry: { text: string }) => entry.text.trim().length > 0)
      : added.map((text: string, index: number) => ({ text, position: index }));
    const isTarget = input_language === "target";
    const newItems = addedPositions.map(({ text, position }: { text: string; position: number }) => ({
      listId: id,
      categoryId: catId,
      textKnown: isTarget ? "" : text,
      textTarget: isTarget ? text : null,
      position,
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
