import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserByDeviceId, type User } from "@/lib/db";

/**
 * Resolve the user from a request.
 * Reads `x-device-id` header (preferred) or `deviceId` query param.
 */
export async function resolveUserFromRequest(
  request: NextRequest
): Promise<User | null> {
  const deviceId =
    request.headers.get("x-device-id") ||
    request.nextUrl.searchParams.get("deviceId");

  if (!deviceId) return null;

  return getOrCreateUserByDeviceId(deviceId);
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
