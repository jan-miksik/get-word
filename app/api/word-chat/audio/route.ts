import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { generateWordChatAudio } from "@/features/word-chat/server/audio";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";
// Google TTS is rate-paced server-side, so a full session's worth of clips can
// take a while; the default serverless window is too tight for it.
export const maxDuration = 120;

type IncomingClip = {
  key?: unknown;
  text?: unknown;
  language?: unknown;
};

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const rawItems = Array.isArray(body.items) ? (body.items as IncomingClip[]) : [];

  const items = rawItems
    .map((item) => ({
      key: typeof item.key === "string" ? item.key : "",
      text: typeof item.text === "string" ? item.text : "",
      language: normalizeLanguageCode(item.language),
    }))
    .filter((item) => item.key && item.text.trim() && item.language);

  if (items.length === 0) {
    return NextResponse.json({ error: "items is required" }, { status: 400 });
  }

  try {
    const { results, quotaExhausted } = await generateWordChatAudio({
      userId: user.id,
      items,
      voiceId: typeof body.voice_id === "string" ? body.voice_id : undefined,
    });

    return NextResponse.json({
      results: results.map((result) => ({
        key: result.key,
        status: result.status,
        asset_id: result.assetId ?? null,
        content_hash: result.contentHash ?? null,
        // Fresh bytes for instant playback; absent for reused clips and for
        // anything past the inline budget.
        audio_base64: result.audioBase64 ?? null,
        error: result.error ?? null,
      })),
      quota_exhausted: quotaExhausted ?? null,
    });
  } catch (err) {
    return wordChatErrorResponse(err);
  }
}
