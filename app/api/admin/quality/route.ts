import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getQualityPool, type PoolAudioFilter, type PoolSort } from "@/lib/db";
import { QUALITY_FLAG_CODES, type QualityFlagCode } from "@/lib/quality-flags";
import { serializeQualityRow } from "@/features/admin/server/quality-serialize";
import {
  HEURISTIC_VERSION,
  LLM_AUDIT_VERSION,
} from "@/features/admin/server/quality-versions";
import type {
  QualityPoolResponse,
  QualityVerdict,
} from "@/features/admin/quality-types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const AUDIO_FILTERS: PoolAudioFilter[] = [
  "any",
  "missing",
  "incomplete",
  "failed",
  "legacy",
  "ready",
  "known_gap",
  "target_gap",
];

const SORTS: PoolSort[] = [
  "suspicion",
  "occurrences",
  "audio",
  "newest",
  "alphabetical",
];

const VERDICTS: (QualityVerdict | "any")[] = [
  "any",
  "unreviewed",
  "ok",
  "suspect",
  "suggested",
];

function parseEnum<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseFlags(value: string | null): QualityFlagCode[] | undefined {
  if (!value) return undefined;
  const codes = value
    .split(",")
    .map((code) => code.trim())
    .filter((code): code is QualityFlagCode =>
      (QUALITY_FLAG_CODES as readonly string[]).includes(code),
    );
  return codes.length > 0 ? codes : undefined;
}

function parseInteger(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * GET /api/admin/quality — one page of the quality pool. Editor-only.
 *
 * Paging is server-side, unlike the other admin lists in this repo: the pool
 * spans every private word pair, which is not a table you hand to the browser
 * whole.
 */
export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const params = request.nextUrl.searchParams;

  try {
    const page = await getQualityPool({
      languageFrom: params.get("languageFrom") ?? undefined,
      languageTo: params.get("languageTo") ?? undefined,
      search: params.get("search") ?? undefined,
      audio: parseEnum(params.get("audio"), AUDIO_FILTERS, "any"),
      flags: parseFlags(params.get("flags")),
      verdict: parseEnum(params.get("verdict"), VERDICTS, "any"),
      maxLlmScore: parseInteger(params.get("maxLlmScore")),
      staleOnly:
        params.get("staleOnly") === "true"
          ? {
              heuristicVersion: HEURISTIC_VERSION,
              llmAuditVersion: LLM_AUDIT_VERSION,
            }
          : undefined,
      sort: parseEnum(params.get("sort"), SORTS, "suspicion"),
      limit: parseInteger(params.get("limit")),
      offset: parseInteger(params.get("offset")),
    });

    const body: QualityPoolResponse = {
      rows: page.rows.map(serializeQualityRow),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      heuristic_version: HEURISTIC_VERSION,
      llm_audit_version: LLM_AUDIT_VERSION,
    };

    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to load the quality pool", error);
    return NextResponse.json(
      { error: "Failed to load the quality pool" },
      { status: 500, headers: NO_STORE },
    );
  }
}
