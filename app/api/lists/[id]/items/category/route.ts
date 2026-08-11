import { NextRequest, NextResponse } from "next/server";
import { assignItemsToCategory, getListById } from '@/lib/db';
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { canManageListContent } from '@/features/lists/public.server';
import { AssignItemsToCategoryRequestSchema } from '@/features/lists/contracts';

type RouteContext = { params: Promise<{ id: string }> };

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

  const parsed = AssignItemsToCategoryRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'itemIds and categoryId are required',
        code: 'INVALID_ASSIGN_CATEGORY_REQUEST',
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const updated = await assignItemsToCategory(id, parsed.data.itemIds, parsed.data.categoryId);
  if (updated.length === 0) {
    // Either no item matched or the category does not belong to this list.
    return NextResponse.json(
      {
        error: "No items were updated (unknown category or items)",
        code: 'CATEGORY_OR_ITEMS_NOT_FOUND',
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ updated });
}
