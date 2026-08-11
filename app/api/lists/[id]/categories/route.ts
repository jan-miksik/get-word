import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  getListCategories,
  createCategory,
  reorderCategories,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { canManageListContent } from '@/features/lists/public.server';

type RouteContext = { params: Promise<{ id: string; catId?: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!list.isPublic && list.ownerId !== user.id) {
    return forbiddenResponse("Not authorized to view this list");
  }

  const categories = await getListCategories(id);
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canManageListContent(list, user)) {
    return forbiddenResponse("Only the list owner can add categories");
  }

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const category = await createCategory(id, body.name);
  return NextResponse.json({ category }, { status: 201 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canManageListContent(list, user)) {
    return forbiddenResponse("Only the list owner can reorder categories");
  }

  const body = await request.json();
  const order = Array.isArray(body.order)
    ? body.order
    : Array.isArray(body.ordered_ids)
      ? body.ordered_ids
      : null;
  if (!order) {
    return NextResponse.json(
      { error: "order (array of category IDs) is required" },
      { status: 400 }
    );
  }

  await reorderCategories(id, order);
  const categories = await getListCategories(id);
  return NextResponse.json({ categories });
}
