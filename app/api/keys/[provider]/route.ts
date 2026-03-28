import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { deleteProviderConnection } from "@/lib/providers/store";
import { isLinkedAccountUser } from "@/lib/providers/user";
import type { ProviderId } from "@/lib/providers/types";

type RouteContext = { params: Promise<{ provider: string }> };

function isProvider(value: string): value is ProviderId {
  return value === "openrouter" || value === "elevenlabs";
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!isLinkedAccountUser(user)) {
    return forbiddenResponse("Link your wallet or email account before managing provider keys");
  }

  const { provider } = await context.params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const removed = await deleteProviderConnection(user.id, provider);
  return NextResponse.json({ success: true, removed });
}
