import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import {
  generatePoolAudio,
  type AudioMode,
  type AudioSide,
  type PoolVoiceChoice,
} from "@/features/admin/server/quality-audio";
import { recordQualityEvent } from "@/lib/db";
import type { QualityAudioResult } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * How the request asked for the voice.
 *
 * `voiceId` is still accepted on its own for compatibility with the original
 * shape of this endpoint, and means the same as `{ mode: "explicit" }`.
 */
function readVoiceChoice(body: {
  voice?: unknown;
  voiceId?: unknown;
}): PoolVoiceChoice {
  const explicit = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  const voice = body.voice as { mode?: unknown; voiceId?: unknown } | undefined;
  const requested = typeof voice?.voiceId === "string" ? voice.voiceId.trim() : "";

  if (voice?.mode === "explicit" && requested !== "") {
    return { kind: "explicit", voiceId: requested };
  }
  if (voice?.mode === "random") return { kind: "random" };
  if (explicit !== "") return { kind: "explicit", voiceId: explicit };
  return { kind: "auto" };
}

/**
 * POST /api/admin/quality/audio — record one side of a pool pair and attach
 * the clip to every item that may share it. Editor-only.
 *
 * Nobody's text is modified: `media_assets` is content-addressed, so a clip is
 * shared rather than copied. In the default `fill` mode an item that already
 * has a playable clip keeps it. `mode: "replace"` is the editor deciding the
 * existing recording is not good enough and is the one path here that changes
 * what a learner already hears — hence the history entry below.
 */
export async function POST(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const body = (await request.json().catch(() => ({}))) as {
    poolKey?: unknown;
    side?: unknown;
    mode?: unknown;
    voice?: unknown;
    voiceId?: unknown;
  };

  if (typeof body.poolKey !== "string" || body.poolKey === "") {
    return NextResponse.json(
      { error: "poolKey is required" },
      { status: 400, headers: NO_STORE },
    );
  }
  const side: AudioSide = body.side === "known" ? "known" : "target";
  const mode: AudioMode = body.mode === "replace" ? "replace" : "fill";

  try {
    const outcome = await generatePoolAudio({
      poolKey: body.poolKey,
      side,
      userId: user.id,
      mode,
      voice: readVoiceChoice(body),
    });

    if (outcome.generated) {
      await recordQualityEvent({
        poolKey: body.poolKey,
        actorUserId: user.id,
        action: mode === "replace" ? "audio_replaced" : "audio_filled",
        side,
        detail: {
          voice_id: outcome.voiceId,
          content_hash: outcome.contentHash,
          linked_items: outcome.linkedItems,
          replaced_items: outcome.replacedItems,
        },
      });
    }

    const payload: QualityAudioResult = {
      generated: outcome.generated,
      linked_items: outcome.linkedItems,
      replaced_items: outcome.replacedItems,
      skipped_items: outcome.skippedItems,
      kept_items: outcome.keptItems,
      content_hash: outcome.contentHash,
      voice_id: outcome.voiceId,
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
