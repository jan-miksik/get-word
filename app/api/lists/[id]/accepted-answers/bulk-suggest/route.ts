import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { getListById } from "@/lib/db";
import {
  AcceptedAnswerSuggestionError,
  suggestAcceptedAnswersBulk,
} from "@/features/lists/server/accepted-answers/bulk-suggest";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: listId } = await context.params;
  const list = await getListById(listId);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (list.ownerId !== user.id) return forbiddenResponse("Not list owner");

  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(
      await suggestAcceptedAnswersBulk({ userId: user.id, list, body }),
    );
  } catch (error) {
    if (error instanceof AcceptedAnswerSuggestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
