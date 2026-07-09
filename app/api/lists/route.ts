import { NextRequest, NextResponse } from "next/server";
import {
  getUserLists,
  getUserSubscribedListIds,
  getSubscriberCountsForLists,
  createList,
} from "@/lib/db";
import {
  isEditor,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { serializeWordList } from "@/lib/word-list-dto";

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const [lists, subscribedListIds] = await Promise.all([
    getUserLists(user.id),
    getUserSubscribedListIds(user.id),
  ]);
  // Subscriber counts power the ambient "N other learners" stewardship cue on
  // public lists. Owners can't subscribe to their own lists, so no per-owner
  // exclusion is needed here.
  const subscriberCounts = await getSubscriberCountsForLists(
    lists.map((list) => list.id),
  );
  return NextResponse.json({
    lists: lists.map((list) => ({
      ...serializeWordList(list),
      isOwner: list.ownerId === user.id,
      subscriberCount: subscriberCounts.get(list.id) ?? 0,
    })),
    subscribedListIds,
    canManageCommonLists: isEditor(user),
  });
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { name, language_from, language_to, description, is_public } = body;

  if (!name || !language_from || !language_to) {
    return NextResponse.json(
      { error: "name, language_from, and language_to are required" },
      { status: 400 }
    );
  }

  const list = await createList({
    ownerId: user.id,
    name,
    description: description ? String(description).trim() || null : null,
    languageFrom: language_from,
    languageTo: language_to,
    isPublic: is_public === true,
  });

  return NextResponse.json({ list: serializeWordList(list) }, { status: 201 });
}
