import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import {
  filterChirp3HdVoices,
  getGoogleVoicesForLanguage,
} from "@/lib/language-catalog";
import type { QualityVoicesResponse } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * GET /api/admin/quality/voices?language=cs — the Chirp3-HD voices the pool
 * can record one language in. Editor-only.
 *
 * A pool page mixes languages row by row, so the voice list is fetched per
 * language on demand rather than shipping the whole `/api/languages` catalog
 * to build one dropdown. `supported: false` is the Māori case — Google offers
 * no voice at all — and is worth saying before an editor picks anything.
 */
export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const language = (request.nextUrl.searchParams.get("language") ?? "").trim();
  if (language === "") {
    return NextResponse.json(
      { error: "language is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const catalog = await getGoogleVoicesForLanguage(language);
    const chirp3Hd = filterChirp3HdVoices(catalog);
    const payload: QualityVoicesResponse = {
      language,
      supported: catalog.length > 0,
      // Chirp3-HD is what the rest of the app records in; a language with none
      // still gets its catalog so the editor can name a voice by hand.
      voices: chirp3Hd.length > 0 ? chirp3Hd : catalog,
    };
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to read the voice catalog", error);
    return NextResponse.json(
      { error: "Failed to read the voice catalog" },
      { status: 502, headers: NO_STORE },
    );
  }
}
