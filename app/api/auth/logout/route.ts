import { NextRequest, NextResponse } from "next/server";
import { GET_WORD_SESSION_COOKIE_NAME, verifySession } from "@/lib/session";
import { updateUserFields } from "@/lib/db";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(GET_WORD_SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(sessionToken);

  if (session?.userId) {
    try {
      const body = (await request.json().catch(() => null)) as { deviceId?: string } | null;
      if (body?.deviceId) {
        await updateUserFields(session.userId, { deviceId: null });
      }
    } catch (error) {
      console.error("[logout] Failed to detach device from user:", error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: GET_WORD_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
