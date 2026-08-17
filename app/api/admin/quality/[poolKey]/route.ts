import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getQualityPoolRow, writeQualityVerdict } from "@/lib/db";
// Only the heuristic generation is stamped from a constant. The audit
// generation is copied from the row itself, so a pair the model never saw
// keeps a null instead of claiming it was judged against an audit.
import { HEURISTIC_VERSION } from "@/features/admin/server/quality-versions";
import type { QualityVerdict } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_NOTE = 1000;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const VERDICTS: QualityVerdict[] = ["unreviewed", "ok", "suspect", "suggested"];

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type RouteContext = { params: Promise<{ poolKey: string }> };

/**
 * PATCH /api/admin/quality/[poolKey] — record a verdict, and optionally a
 * suggested correction. Editor-only.
 *
 * Writes ONLY to `content_quality_reviews`. A learner's `word_list_items` are
 * never edited here: a suggestion is offered to its owner, who applies it
 * through the ordinary edit path or declines it.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const { poolKey } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    verdict?: unknown;
    suggestedKnown?: unknown;
    suggestedTarget?: unknown;
    note?: unknown;
  };

  if (!VERDICTS.includes(body.verdict as QualityVerdict)) {
    return NextResponse.json(
      { error: "Unknown verdict" },
      { status: 400, headers: NO_STORE },
    );
  }
  const verdict = body.verdict as QualityVerdict;

  const suggestedKnown = cleanText(body.suggestedKnown);
  const suggestedTarget = cleanText(body.suggestedTarget);
  const note = cleanText(body.note);

  if (note !== null && note.length > MAX_NOTE) {
    return NextResponse.json(
      { error: `note must be at most ${MAX_NOTE} characters` },
      { status: 400, headers: NO_STORE },
    );
  }
  if (verdict === "suggested" && suggestedKnown === null && suggestedTarget === null) {
    return NextResponse.json(
      { error: "A suggestion needs a corrected known or target side" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    // The pool row is the source of the pair's text, and reaching it goes
    // through the same consent-gated aggregate as everything else — an editor
    // cannot write a verdict about a pair they were never allowed to see.
    const found = await getQualityPoolRow(poolKey);

    if (!found) {
      return NextResponse.json(
        { error: "Pair not found in the pool" },
        { status: 404, headers: NO_STORE },
      );
    }

    const suggestionVersion = await writeQualityVerdict({
      poolKey,
      languageFrom: found.languageFrom,
      languageTo: found.languageTo,
      textKnown: found.textKnown,
      textTarget: found.textTarget,
      verdict,
      suggestedKnown: verdict === "suggested" ? suggestedKnown : null,
      suggestedTarget: verdict === "suggested" ? suggestedTarget : null,
      suggestionNote: verdict === "suggested" ? note : null,
      reviewedBy: user.id,
      heuristicVersion: HEURISTIC_VERSION,
      // Null keeps "never audited" distinct from "audited by generation N".
      llmAuditVersion: found.review?.llmAuditVersion ?? null,
    });

    return NextResponse.json(
      { verdict, suggestion_version: suggestionVersion },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to record quality verdict", error);
    return NextResponse.json(
      { error: "Failed to record the verdict" },
      { status: 500, headers: NO_STORE },
    );
  }
}
