import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { auditInfo, auditWarn } from "@/lib/providers/audit-log";
import { openRouterAdapter } from "@/lib/providers/openrouter";
import {
  getProviderSecret,
  markProviderConnectionStatus,
} from "@/lib/providers/store";
import { isLinkedAccountUser } from "@/lib/providers/user";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before connecting OpenRouter");
  }

  const apiKey = await getProviderSecret(user.id, "openrouter");
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenRouter is not connected for this account" },
      { status: 404 },
    );
  }

  const tested = await openRouterAdapter.testConnection(apiKey);
  const now = new Date();

  if (!tested.ok) {
    await markProviderConnectionStatus({
      userId: user.id,
      provider: "openrouter",
      status: "failed",
      lastValidatedAt: now,
    });
    auditWarn({
      provider: "openrouter",
      step: "manual_test_failed",
      requestId,
      userId: user.id,
      errorCode: tested.errorCode ?? "request_failed",
    });
    return NextResponse.json(
      {
        ok: false,
        error: tested.errorMessage ?? "OpenRouter validation failed",
      },
      { status: 400 },
    );
  }

  const updated = await markProviderConnectionStatus({
    userId: user.id,
    provider: "openrouter",
    status: "connected",
    keyLabel: tested.keyLabel ?? null,
    lastValidatedAt: now,
  });

  auditInfo({
    provider: "openrouter",
    step: "manual_test_ok",
    requestId,
    userId: user.id,
  });

  return NextResponse.json({
    ok: true,
    connection: updated,
  });
}
