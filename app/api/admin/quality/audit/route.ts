import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import {
  auditQualityPool,
  MAX_AUDIT_ITEMS,
} from "@/features/admin/server/quality-audit";
import type { QualityAuditResult } from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * POST /api/admin/quality/audit — score pairs with an external model.
 *
 * Editor-only. The caller names the pairs or accepts the worst candidates;
 * today that caller is the pool page and `scripts/scan-quality-pool.ts`. The
 * consent behind it is the same two-key lock that puts a pair in the pool at
 * all, checked in SQL, not here.
 */
export async function POST(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const body = (await request.json().catch(() => ({}))) as {
    poolKeys?: unknown;
    maxItems?: unknown;
    force?: unknown;
  };

  const requested =
    typeof body.maxItems === "number" && Number.isFinite(body.maxItems)
      ? Math.trunc(body.maxItems)
      : 50;
  if (requested > MAX_AUDIT_ITEMS) {
    return NextResponse.json(
      { error: `maxItems must not exceed ${MAX_AUDIT_ITEMS}` },
      { status: 400, headers: NO_STORE },
    );
  }

  const poolKeys = Array.isArray(body.poolKeys)
    ? body.poolKeys.filter((key): key is string => typeof key === "string")
    : undefined;

  try {
    const result = await auditQualityPool({
      poolKeys,
      maxItems: requested,
      force: body.force === true,
    });

    const payload: QualityAuditResult = {
      audited: result.audited,
      cached: result.cached,
      model: result.model,
    };
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (error) {
    console.error("Quality audit failed", error);
    return NextResponse.json(
      { error: "Audit failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
