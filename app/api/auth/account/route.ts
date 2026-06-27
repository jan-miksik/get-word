import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { GET_WORD_SESSION_COOKIE_NAME } from "@/lib/session";
import { consumeRateLimit, getClientIp } from "@/lib/providers/rate-limit";
import { deleteAccount } from "@/features/auth/server/delete-account";

/**
 * Reject cross-site requests to this destructive endpoint. The session cookie is
 * SameSite=Lax (already strong for a JSON DELETE), and this Origin/Referer check
 * is a cheap additional guard.
 */
function isSameOrigin(request: NextRequest): boolean {
  const expectedHost = request.headers.get("host");
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return true; // no Origin/Referer (e.g. same-origin non-browser) — allow
  try {
    return new URL(source).host === expectedHost;
  } catch {
    return false;
  }
}

/**
 * DELETE /api/auth/account — permanently delete the signed-in user's account.
 *
 * Requires an authenticated session (or device user) plus a type-confirmation
 * value re-validated server-side against the loaded user. Returns
 * `{ status: "deleted" | "completing" }`; the client must only claim full
 * deletion on `"deleted"`.
 */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const ip = getClientIp(request.headers);
  const rate = await consumeRateLimit({
    key: ip,
    endpoint: "delete-account",
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = (await request.json().catch(() => null)) as
    | { confirmation?: string }
    | null;
  // Email users must type their exact email; device-only users type "DELETE".
  const expected = user.email ?? "DELETE";
  if (!body || body.confirmation !== expected) {
    return NextResponse.json({ error: "Confirmation does not match" }, { status: 400 });
  }

  const result = await deleteAccount(user.id);

  const response = NextResponse.json({ status: result.status });
  // Sign the user out: expire the app session cookie. The user's device rows are
  // already gone via the cascade in deleteAccount.
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
