import { NextRequest, NextResponse } from "next/server";
import { handleGenerateAudioBatch } from "@/features/audio/server/generate-batch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `audio-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    return await handleGenerateAudioBatch(request);
  } catch (err) {
    console.error("[Get Word audio] batch generation crashed", {
      requestId,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "Audio generation crashed before it could finish.",
        request_id: requestId,
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
