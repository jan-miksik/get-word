import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { scanQualityPool } from "@/features/admin/server/quality-scan";
import type { QualityScanResult } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * A request has to finish inside the platform's timeout, so the button-driven
 * scan is bounded and resumable via `next_offset`. Large sweeps belong to
 * `scripts/scan-quality-pool.ts`, which has no such ceiling.
 */
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 300;

/** POST /api/admin/quality/scan — run the free, local heuristics. Editor-only. */
export async function POST(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const body = (await request.json().catch(() => ({}))) as {
    limit?: unknown;
    offset?: unknown;
    force?: unknown;
  };

  const limit = Math.min(
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(Math.trunc(body.limit), 1)
      : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  try {
    const result = await scanQualityPool({
      limit,
      offset: typeof body.offset === "number" ? Math.trunc(body.offset) : undefined,
      force: body.force === true,
    });

    const payload: QualityScanResult = {
      scanned: result.scanned,
      flagged: result.flagged,
      unchanged: result.unchanged,
      next_offset: result.nextOffset,
    };
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (error) {
    console.error("Quality pool scan failed", error);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
