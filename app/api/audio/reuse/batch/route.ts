import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { findUnauthorizedAudioItemIds } from "@/features/audio/server/list-authz";
import {
  AudioReuseBatchError,
  reuseAudioBatch,
  type AudioReuseItem,
} from "@/features/audio/server/reuse-batch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items as AudioReuseItem[] : [];
  if (body.link === true && items.length > 0) {
    const unauthorized = await findUnauthorizedAudioItemIds(
      items.map((item) => item.id),
      user,
    );
    if (unauthorized.length > 0) {
      return forbiddenResponse("Not authorized to link audio for one or more items");
    }
  }

  try {
    return NextResponse.json(await reuseAudioBatch(body));
  } catch (error) {
    if (error instanceof AudioReuseBatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
