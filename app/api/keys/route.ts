import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { openRouterAdapter } from "@/lib/providers/openrouter";
import {
  listProviderConnections,
  upsertProviderSecret,
} from "@/lib/providers/store";
import { isLinkedAccountUser } from "@/lib/providers/user";
import type { ProviderId } from "@/lib/providers/types";

const SUPPORTED_PROVIDERS: ProviderId[] = ["openrouter", "elevenlabs"];

function isSupportedProvider(provider: string): provider is ProviderId {
  return SUPPORTED_PROVIDERS.includes(provider as ProviderId);
}

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before managing provider keys");
  }

  const keys = await listProviderConnections(user.id);
  return NextResponse.json({
    keys: keys.map((k) => ({
      provider: k.provider,
      lastFour: k.keyLast4 ?? "",
      createdAt: k.createdAt,
      status: k.status,
      keyLabel: k.keyLabel,
      connectedAt: k.connectedAt,
      lastValidatedAt: k.lastValidatedAt,
      connectionMethod: k.connectionMethod,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before managing provider keys");
  }

  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === "string" ? body.provider : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const keyLabelInput = typeof body.key_label === "string" ? body.key_label.trim() : null;

  if (!isSupportedProvider(provider)) {
    return NextResponse.json(
      { error: "Unsupported provider" },
      { status: 400 },
    );
  }

  if (!key) {
    return NextResponse.json(
      { error: "API key is required" },
      { status: 400 },
    );
  }

  let status: "connected" | "failed" = "connected";
  let keyLabel = keyLabelInput;
  let lastValidatedAt: Date | null = null;

  if (provider === "openrouter") {
    const test = await openRouterAdapter.testConnection(key);
    if (!test.ok) {
      return NextResponse.json(
        {
          error: test.errorMessage ?? "OpenRouter API key validation failed",
        },
        { status: 400 },
      );
    }
    keyLabel = test.keyLabel ?? keyLabel;
    lastValidatedAt = new Date();
    status = "connected";
  }

  const connection = await upsertProviderSecret({
    userId: user.id,
    provider,
    plainSecret: key,
    keyLabel,
    status,
    connectionMethod: "manual",
    lastValidatedAt,
  });

  return NextResponse.json({
    success: true,
    key: {
      provider: connection.provider,
      lastFour: connection.keyLast4 ?? "",
      createdAt: connection.createdAt,
      status: connection.status,
      keyLabel: connection.keyLabel,
      connectedAt: connection.connectedAt,
      lastValidatedAt: connection.lastValidatedAt,
      connectionMethod: connection.connectionMethod,
    },
  });
}
