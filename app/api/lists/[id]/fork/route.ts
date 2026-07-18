import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { getListById } from "@/lib/db";
import {
  createForkListStream,
  ForkListInputError,
} from "@/features/lists/server/fork-list";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: sourceListId } = await context.params;
  const sourceList = await getListById(sourceListId);
  if (!sourceList) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!sourceList.isPublic && sourceList.ownerId !== user.id) {
    return NextResponse.json({ error: "Cannot fork this list" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const stream = await createForkListStream({ userId: user.id, sourceList, body });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    if (error instanceof ForkListInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
