import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { getListById } from "@/lib/db";
import {
  UpdateItemTranslationsError,
  updateListItemTranslations,
} from "@/features/lists/server/update-item-translations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: listId } = await context.params;
  const list = await getListById(listId);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (list.ownerId !== user.id) return forbiddenResponse("Not list owner");

  const body = await request.json();
  try {
    return NextResponse.json(await updateListItemTranslations(body));
  } catch (error) {
    if (error instanceof UpdateItemTranslationsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
