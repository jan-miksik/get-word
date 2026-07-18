import { NextRequest, NextResponse } from "next/server";
import { getLandingDemoAudio } from "@/features/landing/server/getDemoAudio";

export const runtime = "nodejs";

/**
 * GET /api/audio/demo?lang=cs — pre-generated audio for the landing demo card.
 *
 * Public (the landing page has no session), but restricted to the fixed demo
 * word whitelist, so it cannot be used to probe arbitrary texts. Returns the
 * newest playable stored variant per word; words without stored audio come
 * back with `audio_url: null` and the card falls back to speech synthesis.
 */
export async function GET(request: NextRequest) {
  const langParam = request.nextUrl.searchParams.get("lang") ?? "";
  const payload = await getLandingDemoAudio(langParam);
  if (!payload) {
    return NextResponse.json(
      { error: "Unsupported demo language" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    payload,
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}
