import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getQualityEvents } from "@/lib/db";
import type { QualityHistoryResponse } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

type RouteContext = { params: Promise<{ poolKey: string }> };

/**
 * GET /api/admin/quality/[poolKey]/history — what editors did to this pair,
 * newest first. Editor-only.
 *
 * Kept off the pool listing on purpose: a history is read one pair at a time,
 * and joining it into a corpus-wide aggregate would cost every page load for
 * something almost no row on it needs.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await resolveAuthenticatedUser(_request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const { poolKey } = await context.params;

  try {
    const events = await getQualityEvents(poolKey);
    const payload: QualityHistoryResponse = {
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        side: event.side,
        detail: event.detail,
        actor: event.actorEmail,
        created_at: event.createdAt,
      })),
    };
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to read quality pool history", error);
    return NextResponse.json(
      { error: "Failed to read the history" },
      { status: 500, headers: NO_STORE },
    );
  }
}
