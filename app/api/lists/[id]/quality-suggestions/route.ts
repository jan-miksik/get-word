import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import {
  getListById,
  getListQualitySuggestions,
  dismissQualitySuggestion,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/lists/[id]/quality-suggestions
 *
 * The learner's half of the quality pool. Owner-only — this is the one place
 * where a suggestion is joined back to the actual items, and the editor who
 * wrote it never sees which list it landed in.
 *
 * Kept out of `/api/sync` on purpose: suggestions appear only in the list
 * editor, so they should not enlarge every client's sync payload or force a
 * content revision bump.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404, headers: NO_STORE });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Only the owner can see suggestions for this list");
  }

  const suggestions = await getListQualitySuggestions(id, user.id);
  return NextResponse.json(
    {
      suggestions: suggestions.map((suggestion) => ({
        item_id: suggestion.itemId,
        pool_key: suggestion.poolKey,
        suggestion_version: suggestion.suggestionVersion,
        current_target: suggestion.currentTarget,
        suggested_known: suggestion.suggestedKnown,
        suggested_target: suggestion.suggestedTarget,
        note: suggestion.note,
      })),
    },
    { headers: NO_STORE },
  );
}

/**
 * POST — decline a suggestion. Keyed on the version, so an improved
 * suggestion for the same pair is shown again rather than staying buried.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404, headers: NO_STORE });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Only the owner can dismiss suggestions for this list");
  }

  const body = (await request.json().catch(() => ({}))) as {
    poolKey?: unknown;
    suggestionVersion?: unknown;
  };

  if (
    typeof body.poolKey !== "string" ||
    body.poolKey === "" ||
    typeof body.suggestionVersion !== "number" ||
    !Number.isFinite(body.suggestionVersion) ||
    body.suggestionVersion < 0
  ) {
    return NextResponse.json(
      { error: "poolKey and suggestionVersion are required" },
      { status: 400, headers: NO_STORE },
    );
  }

  // The dismissal's pool_key has a foreign key into the review table, so a key
  // that names no review raises rather than inserting. That is a bad request,
  // not a server fault — reporting it as a 500 would send the client looking
  // in the wrong place.
  const suggestions = await getListQualitySuggestions(id, user.id);
  if (!suggestions.some((suggestion) => suggestion.poolKey === body.poolKey)) {
    return NextResponse.json(
      { error: "No open suggestion for this pair in this list" },
      { status: 404, headers: NO_STORE },
    );
  }

  try {
    await dismissQualitySuggestion(user.id, body.poolKey, Math.trunc(body.suggestionVersion));
  } catch (error) {
    console.error("Failed to dismiss a quality suggestion", error);
    return NextResponse.json(
      { error: "Failed to dismiss the suggestion" },
      { status: 500, headers: NO_STORE },
    );
  }
  return NextResponse.json({ dismissed: true }, { headers: NO_STORE });
}
