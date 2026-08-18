import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { GET_WORD_SESSION_COOKIE_NAME } from "@/lib/session";
import { consumeRateLimit, getClientIp } from "@/lib/providers/rate-limit";
import { deleteAccount } from "@/features/auth/server/delete-account";
import { NATIVE_APP_ORIGINS } from "@/features/shared/routes/api-cors";

/**
 * Reject cross-site requests to this destructive endpoint. The session cookie is
 * SameSite=Lax (already strong for a JSON DELETE), and this Origin/Referer check
 * is a cheap additional guard.
 *
 * The native client is a legitimate cross-origin caller: it runs on
 * `capacitor://localhost` and authenticates with the Keychain bearer token, not
 * the cookie, so it is allowed by the same allowlist the CORS layer uses.
 * Allowing it costs nothing extra — a hostile page on one of those origins
 * still cannot send the cookie (SameSite) and gets no credentialed CORS grant.
 */
function isAllowedOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin");
  // Compared as the raw header: `new URL("capacitor://localhost").origin` is
  // the string "null" for a non-special scheme, so parsing loses the identity.
  if (originHeader && NATIVE_APP_ORIGINS.has(originHeader)) return true;

  const expectedHost = request.headers.get("host");
  const source = originHeader ?? request.headers.get("referer");
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
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  // Anti-hammering only — the real gate is the session plus a confirmation
  // re-validated against the loaded user. The budget is spent by *failed*
  // attempts too (a mistyped email, a rejected origin), so the window is short:
  // a user who has just been shown an error must be able to try again soon,
  // and the key is a shared carrier IP for most native clients.
  const ip = getClientIp(request.headers);
  const rate = await consumeRateLimit({
    key: ip,
    endpoint: "delete-account",
    limit: 5,
    windowSeconds: 600,
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
