import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserByDeviceId, getUserById, type User } from "@/lib/db";
import { readSessionToken, verifySession } from "@/lib/session";

/**
 * Resolve the user from a request.
 * Reads `x-device-id` header (preferred) or `deviceId` query param.
 */
export async function resolveUserFromRequest(
  request: NextRequest
): Promise<User | null> {
  const sessionToken = readSessionToken(request);
  const session = await verifySession(sessionToken);
  if (session?.userId) {
    const sessionUser = await getUserById(session.userId);
    if (sessionUser) return sessionUser;
  }

  // An explicit Authorization header is an authentication attempt. Never
  // downgrade an invalid bearer token to an anonymous device identity.
  if (request.headers.get("authorization")) return null;

  const deviceId =
    request.headers.get("x-device-id") ||
    request.nextUrl.searchParams.get("deviceId");

  if (!deviceId) return null;

  return getOrCreateUserByDeviceId(deviceId);
}

/** Strict auth resolver: only accepts a valid signed session cookie. */
export async function resolveAuthenticatedUser(
  request: NextRequest
): Promise<User | null> {
  const sessionToken = readSessionToken(request);
  const session = await verifySession(sessionToken);
  if (!session?.userId) return null;
  return getUserById(session.userId);
}

export function isEditor(user: User): boolean {
  return user.userRole === "editor";
}

/**
 * Whether a user may publish a list to everyone.
 *
 * App Store guideline 1.2 wants user-generated content filtered *before* it is
 * published, not only reported after the fact. Until a moderation queue exists,
 * publishing is an editor-only action: everyone else keeps their lists private
 * and hands them out with the `/join/{token}` link, which is a capability rather
 * than public content.
 */
export function canPublishPublicList(user: User): boolean {
  return isEditor(user);
}

export function unauthorizedResponse(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Editor role required") {
  return NextResponse.json({ error: message }, { status: 403 });
}
