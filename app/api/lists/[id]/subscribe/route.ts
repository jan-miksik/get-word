import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  isUserSubscribed,
  createUserSubscription,
  unsubscribeFromList,
  isBlockedBetweenUsers,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/lists/[id]/subscribe — check subscription status */
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const subscribed = await isUserSubscribed(user.id, id);

  return NextResponse.json({ subscribed });
}

/** POST /api/lists/[id]/subscribe — subscribe to a list */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: sourceListId } = await context.params;

  // Verify source list exists and is public
  const sourceList = await getListById(sourceListId);
  if (!sourceList) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (
    sourceList.ownerId !== user.id &&
    ((sourceList.moderationStatus && sourceList.moderationStatus !== "visible") ||
      (await isBlockedBetweenUsers(user.id, sourceList.ownerId)))
  ) {
    return NextResponse.json({ error: "This list is unavailable" }, { status: 403 });
  }
  if (!sourceList.isPublic && sourceList.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Can only subscribe to public lists" },
      { status: 403 },
    );
  }
  if (sourceList.ownerId === user.id) {
    return NextResponse.json(
      { error: "Cannot subscribe to your own list" },
      { status: 400 },
    );
  }

  // Check if already subscribed
  const alreadySubscribed = await isUserSubscribed(user.id, sourceListId);
  if (alreadySubscribed) {
    return NextResponse.json(
      { error: "Already subscribed to this list" },
      { status: 409 },
    );
  }

  // Create subscription record (items served directly from curated list)
  await createUserSubscription(user.id, sourceListId);

  return NextResponse.json({ subscribed: true }, { status: 201 });
}

/** DELETE /api/lists/[id]/subscribe — unsubscribe from a list */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: sourceListId } = await context.params;

  // Check if subscribed
  const subscribed = await isUserSubscribed(user.id, sourceListId);
  if (!subscribed) {
    return NextResponse.json(
      { error: "Not subscribed to this list" },
      { status: 404 },
    );
  }

  // Unsubscribe: archive any copied items, remove subscription record
  const { archived } = await unsubscribeFromList(user.id, sourceListId);

  return NextResponse.json({ subscribed: false, archived });
}
