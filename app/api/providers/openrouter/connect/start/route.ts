import { NextRequest, NextResponse } from "next/server";
import { getRequestPublicOrigin } from "@/features/auth/app-url";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { auditInfo, auditWarn } from "@/lib/providers/audit-log";
import { buildOpenRouterAuthorizeUrl } from "@/lib/providers/openrouter";
import {
  createOAuthState,
  createPkceChallenge,
  OPENROUTER_OAUTH_COOKIE_NAME,
  parseOAuthState,
  serializeOAuthState,
} from "@/lib/providers/oauth-state";
import { consumeRateLimit, getClientIp } from "@/lib/providers/rate-limit";
import { isLinkedAccountUser } from "@/lib/providers/user";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before connecting OpenRouter");
  }

  const ip = getClientIp(request.headers);
  const rateLimit = await consumeRateLimit({
    key: `${user.id}:${ip}`,
    endpoint: "openrouter_connect_start",
    limit: 10,
    windowSeconds: 60,
  });

  if (!rateLimit.allowed) {
    auditWarn({
      provider: "openrouter",
      step: "connect_start_rate_limited",
      requestId,
      userId: user.id,
      errorCode: "rate_limited",
      statusCode: 429,
    });
    return NextResponse.json(
      {
        error: "Too many connection attempts. Please retry shortly.",
      },
      {
        status: 429,
        headers: {
          "retry-after": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const existing = await parseOAuthState(
    request.cookies.get(OPENROUTER_OAUTH_COOKIE_NAME)?.value,
  );
  if (existing && existing.userId === user.id) {
    return NextResponse.json(
      {
        error: "A connection flow is already in progress. Complete or retry it.",
      },
      { status: 409 },
    );
  }

  const requestBody = await request.json().catch(() => ({}));
  const returnToRaw = typeof requestBody?.returnTo === "string" ? requestBody.returnTo : "/lists";
  const oauthState = createOAuthState({
    userId: user.id,
    returnTo: returnToRaw,
  });

  const callback = new URL(
    "/api/providers/openrouter/callback",
    getRequestPublicOrigin(request),
  );
  callback.searchParams.set("state", oauthState.state);
  const authorizeUrl = buildOpenRouterAuthorizeUrl({
    callbackUrl: callback.toString(),
    codeChallenge: await createPkceChallenge(oauthState.codeVerifier),
  });

  auditInfo({
    provider: "openrouter",
    step: "connect_start_issued",
    requestId,
    userId: user.id,
  });

  const response = NextResponse.json({ authorizeUrl });
  response.cookies.set({
    name: OPENROUTER_OAUTH_COOKIE_NAME,
    value: await serializeOAuthState(oauthState),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
