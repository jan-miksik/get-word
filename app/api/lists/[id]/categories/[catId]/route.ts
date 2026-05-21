import { NextRequest, NextResponse } from "next/server";
import { getListById, deleteCategory, renameCategory } from "@/lib/db";
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id, catId } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canManageListContent(list, user)) {
    return forbiddenResponse("Only the list owner can rename categories");
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const updated = await renameCategory(id, catId, name);
  if (!updated) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({ category: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id, catId } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canManageListContent(list, user)) {
    return forbiddenResponse("Only the list owner can delete categories");
  }

  const deleted = await deleteCategory(id, catId);
  if (!deleted) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
