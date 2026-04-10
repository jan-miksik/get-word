import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserByDeviceId, getUserById, type User } from "@/lib/db";
import { verifySession, WORDLINK_SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * Resolve the user from a request.
 * Reads `x-device-id` header (preferred) or `deviceId` query param.
 */
export async function resolveUserFromRequest(
  request: NextRequest
): Promise<User | null> {
  const sessionToken = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(sessionToken);
  if (session?.userId) {
    const sessionUser = await getUserById(session.userId);
    if (sessionUser) return sessionUser;
  }

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
  const sessionToken = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(sessionToken);
  if (!session?.userId) return null;
  return getUserById(session.userId);
}

export function isEditor(user: User): boolean {
  return user.userRole === "editor";
}

export function unauthorizedResponse(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Editor role required") {
  return NextResponse.json({ error: message }, { status: 403 });
}
