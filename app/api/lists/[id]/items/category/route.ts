import { NextRequest, NextResponse } from "next/server";
import { assignItemsToCategory, getListById } from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
  isEditor,
} from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

function canManageListContent(
  list: Awaited<ReturnType<typeof getListById>>,
  user: NonNullable<Awaited<ReturnType<typeof resolveUserFromRequest>>>,
) {
  return Boolean(list && (list.ownerId === user.id || (list.isCommon && isEditor(user))));
}

// Move one or more items into an existing category of the same list. Used by the
// review step to fix words that ended up with no category. Only `categoryId`
// changes; nothing identity-bearing is touched (see assignItemsToCategory).
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
  const categoryId: unknown = body?.categoryId;
  if (!Array.isArray(itemIds) || itemIds.some((value) => typeof value !== "string")) {
    return NextResponse.json(
      { error: "itemIds must be an array of strings" },
      { status: 400 },
    );
  }
  if (typeof categoryId !== "string" || !categoryId) {
    return NextResponse.json(
      { error: "categoryId must be a non-empty string" },
      { status: 400 },
    );
  }

  const updated = await assignItemsToCategory(id, itemIds as string[], categoryId);
  if (updated.length === 0) {
    // Either no item matched or the category does not belong to this list.
    return NextResponse.json(
      { error: "No items were updated (unknown category or items)" },
      { status: 400 },
    );
  }

  return NextResponse.json({ updated });
}
