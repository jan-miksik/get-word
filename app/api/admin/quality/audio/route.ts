import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import {
  generatePoolAudio,
  type AudioSide,
} from "@/features/admin/server/quality-audio";
import type { QualityAudioResult } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * POST /api/admin/quality/audio — record the missing clip for one pool pair
 * and attach it to every item that may share it. Editor-only.
 *
 * Nobody's text is modified: `media_assets` is content-addressed, so this only
 * ever fills a gap.
 */
export async function POST(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const body = (await request.json().catch(() => ({}))) as {
    poolKey?: unknown;
    side?: unknown;
    voiceId?: unknown;
  };

  if (typeof body.poolKey !== "string" || body.poolKey === "") {
    return NextResponse.json(
      { error: "poolKey is required" },
      { status: 400, headers: NO_STORE },
    );
  }
  const side: AudioSide = body.side === "known" ? "known" : "target";

  try {
    const outcome = await generatePoolAudio({
      poolKey: body.poolKey,
      side,
      userId: user.id,
      voiceId: typeof body.voiceId === "string" ? body.voiceId : undefined,
    });

    const payload: QualityAudioResult = {
      generated: outcome.generated,
      linked_items: outcome.linkedItems,
      skipped_items: outcome.skippedItems,
      content_hash: outcome.contentHash,
      ...(outcome.error ? { error: outcome.error } : {}),
    };
    return NextResponse.json(payload, {
      status: outcome.generated ? 200 : 422,
      headers: NO_STORE,
    });
  } catch (error) {
    console.error("Pool audio generation failed", error);
    return NextResponse.json(
      { error: "Audio generation failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
