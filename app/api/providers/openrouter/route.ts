import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import {
  OPENROUTER_OAUTH_COOKIE_NAME,
  parseOAuthState,
} from "@/lib/providers/oauth-state";
import {
  deleteProviderConnection,
  getProviderConnection,
  updateProviderTranslationModel,
} from "@/lib/providers/store";
import { isLinkedAccountUser } from "@/lib/providers/user";
import { normalizeOpenRouterModel } from "@/lib/openrouter-models";

type UiState = "not_connected" | "connecting" | "connected" | "failed_retryable";

function toUiState(input: {
  hasPendingOAuth: boolean;
  status: string | null;
}): UiState {
  if (input.hasPendingOAuth) return "connecting";
  if (!input.status) return "not_connected";
  if (input.status === "failed") return "failed_retryable";
  return "connected";
}

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before connecting OpenRouter");
  }

  const connection = await getProviderConnection(user.id, "openrouter");
  const pending = parseOAuthState(
    request.cookies.get(OPENROUTER_OAUTH_COOKIE_NAME)?.value,
  );

  return NextResponse.json({
    provider: "openrouter",
    state: toUiState({
      hasPendingOAuth: Boolean(pending && pending.userId === user.id),
      status: connection?.status ?? null,
    }),
    connection,
  });
}

export async function DELETE(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before connecting OpenRouter");
  }

  const removed = await deleteProviderConnection(user.id, "openrouter");
  return NextResponse.json({ success: true, removed });
}

export async function PATCH(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before connecting OpenRouter");
  }

  const body = await request.json().catch(() => ({}));
  const translationModel = normalizeOpenRouterModel(body.translation_model);
  const connection = await updateProviderTranslationModel({
    userId: user.id,
    provider: "openrouter",
    translationModel,
  });

  if (!connection) {
    return NextResponse.json(
      { error: "OpenRouter is not connected for this account" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, connection });
}
