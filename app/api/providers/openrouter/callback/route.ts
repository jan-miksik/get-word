import { NextRequest, NextResponse } from "next/server";
import { auditError, auditInfo, auditWarn } from "@/lib/providers/audit-log";
import { openRouterAdapter } from "@/lib/providers/openrouter";
import {
  OPENROUTER_OAUTH_COOKIE_NAME,
  parseOAuthState,
} from "@/lib/providers/oauth-state";
import { consumeRateLimit, getClientIp } from "@/lib/providers/rate-limit";
import { upsertProviderSecret } from "@/lib/providers/store";

type CallbackStatus = "connected" | "failed";

function getAppBaseUrl(request: NextRequest): string {
  return process.env.WORDLINK_APP_URL?.trim() || request.nextUrl.origin;
}

function normalizeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/")) return "/lists";
  return value;
}

function buildRedirectUrl(input: {
  request: NextRequest;
  returnTo?: string;
  status: CallbackStatus;
  reason?: string;
}): URL {
  const url = new URL(normalizeReturnTo(input.returnTo), getAppBaseUrl(input.request));
  url.searchParams.set("openrouter", input.status);
  if (input.reason) {
    url.searchParams.set("reason", input.reason);
  }
  return url;
}

function toReason(message: string): string {
  if (message.includes("expired")) return "code_expired";
  if (message.includes("invalid")) return "invalid_code";
  if (message.includes("rejected")) return "exchange_rejected";
  return "exchange_failed";
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);
  const rawStateCookie = request.cookies.get(OPENROUTER_OAUTH_COOKIE_NAME)?.value;
  const parsedState = parseOAuthState(rawStateCookie);

  const ipRateLimit = await consumeRateLimit({
    key: ip,
    endpoint: "openrouter_callback_ip",
    limit: 45,
    windowSeconds: 60,
  });
  if (!ipRateLimit.allowed) {
    const redirect = NextResponse.redirect(
      buildRedirectUrl({
        request,
        returnTo: parsedState?.returnTo,
        status: "failed",
        reason: "rate_limited",
      }),
    );
    redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
    return redirect;
  }

  const stateFromQuery = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!parsedState || !stateFromQuery || stateFromQuery !== parsedState.state) {
    auditWarn({
      provider: "openrouter",
      step: "callback_invalid_state",
      requestId,
      errorCode: "invalid_state",
      statusCode: 400,
    });
    const redirect = NextResponse.redirect(
      buildRedirectUrl({
        request,
        status: "failed",
        reason: "invalid_state",
      }),
    );
    redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
    return redirect;
  }

  const userRateLimit = await consumeRateLimit({
    key: `${parsedState.userId}:${ip}`,
    endpoint: "openrouter_callback_user",
    limit: 20,
    windowSeconds: 60,
  });
  if (!userRateLimit.allowed) {
    const redirect = NextResponse.redirect(
      buildRedirectUrl({
        request,
        returnTo: parsedState.returnTo,
        status: "failed",
        reason: "rate_limited",
      }),
    );
    redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
    return redirect;
  }

  if (!code) {
    auditWarn({
      provider: "openrouter",
      step: "callback_missing_code",
      requestId,
      userId: parsedState.userId,
      errorCode: "missing_code",
      statusCode: 400,
    });
    const redirect = NextResponse.redirect(
      buildRedirectUrl({
        request,
        returnTo: parsedState.returnTo,
        status: "failed",
        reason: "missing_code",
      }),
    );
    redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
    return redirect;
  }

  try {
    auditInfo({
      provider: "openrouter",
      step: "callback_exchange_started",
      requestId,
      userId: parsedState.userId,
    });

    const exchange = await openRouterAdapter.exchangeCode({
      code,
      codeVerifier: parsedState.codeVerifier,
    });

    const tested = await openRouterAdapter.testConnection(exchange.apiKey);
    if (!tested.ok) {
      auditWarn({
        provider: "openrouter",
        step: "callback_test_failed",
        requestId,
        userId: parsedState.userId,
        errorCode: tested.errorCode ?? "test_failed",
      });
      const redirect = NextResponse.redirect(
        buildRedirectUrl({
          request,
          returnTo: parsedState.returnTo,
          status: "failed",
          reason: tested.errorCode ?? "test_failed",
        }),
      );
      redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
      return redirect;
    }

    const finalLabel = tested.keyLabel ?? exchange.keyLabel ?? null;
    await upsertProviderSecret({
      userId: parsedState.userId,
      provider: "openrouter",
      plainSecret: exchange.apiKey,
      keyLabel: finalLabel,
      status: "connected",
      connectionMethod: "oauth",
      lastValidatedAt: new Date(),
    });

    auditInfo({
      provider: "openrouter",
      step: "callback_exchange_completed",
      requestId,
      userId: parsedState.userId,
    });

    const redirect = NextResponse.redirect(
      buildRedirectUrl({
        request,
        returnTo: parsedState.returnTo,
        status: "connected",
      }),
    );
    redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
    redirect.headers.set("cache-control", "no-store");
    return redirect;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenRouter callback failed";
    auditError({
      provider: "openrouter",
      step: "callback_exchange_failed",
      requestId,
      userId: parsedState.userId,
      errorCode: toReason(message),
      details: message,
    });
    const redirect = NextResponse.redirect(
      buildRedirectUrl({
        request,
        returnTo: parsedState.returnTo,
        status: "failed",
        reason: toReason(message),
      }),
    );
    redirect.cookies.delete(OPENROUTER_OAUTH_COOKIE_NAME);
    return redirect;
  }
}
