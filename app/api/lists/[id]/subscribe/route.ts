import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  isUserSubscribed,
  subscribeToList,
  unsubscribeFromList,
  getOrCreateUserList,
  getUserSubscribedListIds,
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

  // Get or create user's personal list
  const userList = await getOrCreateUserList(user.id);

  // Copy-on-write items from source to user's list
  const { copied } = await subscribeToList(user.id, sourceListId, userList.id);

  return NextResponse.json({ subscribed: true, copied }, { status: 201 });
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

  // Get user's personal list
  const userList = await getOrCreateUserList(user.id);

  // Unsubscribe: archive progress, delete copied items, remove subscription
  const { archived } = await unsubscribeFromList(user.id, sourceListId, userList.id);

  return NextResponse.json({ subscribed: false, archived });
}
