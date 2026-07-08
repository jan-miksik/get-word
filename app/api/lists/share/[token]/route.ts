import { NextRequest, NextResponse } from "next/server";
import {
  getListByShareToken,
  isUserSubscribed,
  createUserSubscription,
  updateUserPreferences,
} from "@/lib/db";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";

type RouteContext = { params: Promise<{ token: string }> };

// 24-byte base64url ≈ 32 chars. Kept loose so a future token-length change
// doesn't break validation; still rejects junk/oversized input cheaply.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * GET /api/lists/share/[token] — token-scoped preview of a shared list.
 *
 * The token is the capability: this deliberately bypasses the `isPublic ||
 * owner` check so a private list can be previewed via link. The token is
 * validated and resolved to a list BEFORE the user is resolved, so bot hits on
 * bad tokens can't create device-user rows. Never returns `share_token`.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const list = await getListByShareToken(token);
  if (!list) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  // Only now resolve (and possibly create) the device user.
  const user = await resolveUserFromRequest(request);
  const isOwner = !!user && list.ownerId === user.id;
  const alreadySubscribed =
    !!user && !isOwner && (await isUserSubscribed(user.id, list.id));

  return NextResponse.json({
    listId: list.id,
    name: list.name,
    languageFrom: list.languageFrom,
    languageTo: list.languageTo,
    isPublic: list.isPublic,
    isOwner,
    alreadySubscribed,
  });
}

/**
 * POST /api/lists/share/[token] — subscribe the current user to a shared list
 * via the token capability. Private-list-safe analogue of
 * /api/lists/[id]/subscribe (which stays locked to public/owner). Idempotent:
 * a no-op for the owner or an already-subscribed user.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const list = await getListByShareToken(token);
  if (!list) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request
    .json()
    .then((value: { activate?: unknown } | null) => value)
    .catch(() => null);
  const shouldActivate = body?.activate === true;

  if (list.ownerId === user.id) {
    return NextResponse.json({
      listId: list.id,
      isOwner: true,
      alreadySubscribed: false,
    });
  }

  const alreadySubscribed = await isUserSubscribed(user.id, list.id);
  if (!alreadySubscribed) {
    await createUserSubscription(user.id, list.id);
  }

  if (shouldActivate) {
    await updateUserPreferences(user.id, {
      language_from: list.languageFrom,
      language_to: list.languageTo,
      onboarding_completed: true,
    });
  }

  return NextResponse.json({
    listId: list.id,
    languageFrom: list.languageFrom,
    languageTo: list.languageTo,
    isOwner: false,
    alreadySubscribed,
  });
}
