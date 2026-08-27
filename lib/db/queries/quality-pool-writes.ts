/**
 * Admin scan, audit, and verdict writes for quality-pool rows.
 */

import { sql } from 'drizzle-orm';
import { db } from '../client';
import type { QualityHeuristicFlag } from '@/lib/quality-flags';
import type { QualityVerdict } from './quality-pool-shared';

function numberFrom(value: unknown): number {
  return Number(value ?? 0) || 0;
}

export interface HeuristicUpsert {
  poolKey: string;
  languageFrom: string;
  languageTo: string;
  textKnown: string;
  textTarget: string;
  flags: QualityHeuristicFlag[];
  version: number;
}

/**
 * Store one scan's heuristic verdict.
 *
 * The editor's own columns are deliberately absent from the UPDATE list: a
 * re-scan must never overwrite a verdict, a suggestion, or its version. It
 * only refreshes what the scan itself computed, plus `last_seen_at`.
 */
export async function upsertQualityHeuristics(
  entries: HeuristicUpsert[],
): Promise<number> {
  if (entries.length === 0) return 0;

  const values = sql.join(
    entries.map(
      (entry) => sql`(
        ${entry.poolKey}, ${entry.languageFrom}, ${entry.languageTo},
        ${entry.textKnown}, ${entry.textTarget},
        ${JSON.stringify(entry.flags)}::jsonb, ${entry.version},
        now(), now(), now(), now())`,
    ),
    sql`, `,
  );

  const result = (await db.execute(sql`
    INSERT INTO content_quality_reviews (
      pool_key, language_from, language_to, text_known, text_target,
      heuristic_flags, heuristic_version,
      heuristic_scanned_at, last_seen_at, created_at, updated_at)
    VALUES ${values}
    ON CONFLICT (pool_key) DO UPDATE SET
      language_from        = EXCLUDED.language_from,
      language_to          = EXCLUDED.language_to,
      text_known           = EXCLUDED.text_known,
      text_target          = EXCLUDED.text_target,
      heuristic_flags      = EXCLUDED.heuristic_flags,
      heuristic_version    = EXCLUDED.heuristic_version,
      heuristic_scanned_at = EXCLUDED.heuristic_scanned_at,
      last_seen_at         = EXCLUDED.last_seen_at,
      updated_at           = now()
    RETURNING pool_key`)) as unknown as Record<string, unknown>[];

  return result.length;
}

export interface AuditUpsert {
  poolKey: string;
  languageFrom: string;
  languageTo: string;
  textKnown: string;
  textTarget: string;
  score: number;
  reason: string | null;
  suggestedTarget: string | null;
  model: string;
  version: number;
}

/** Store one LLM audit result. Leaves the editor's verdict untouched. */
export async function upsertQualityAudit(entries: AuditUpsert[]): Promise<number> {
  if (entries.length === 0) return 0;

  const values = sql.join(
    entries.map(
      (entry) => sql`(
        ${entry.poolKey}, ${entry.languageFrom}, ${entry.languageTo},
        ${entry.textKnown}, ${entry.textTarget},
        ${entry.score}, ${entry.reason}, ${entry.suggestedTarget},
        ${entry.model}, ${entry.version}, now(), now(), now(), now())`,
    ),
    sql`, `,
  );

  const result = (await db.execute(sql`
    INSERT INTO content_quality_reviews (
      pool_key, language_from, language_to, text_known, text_target,
      llm_score, llm_reason, llm_suggested_target, llm_model, llm_audit_version,
      llm_checked_at, last_seen_at, created_at, updated_at)
    VALUES ${values}
    ON CONFLICT (pool_key) DO UPDATE SET
      llm_score            = EXCLUDED.llm_score,
      llm_reason           = EXCLUDED.llm_reason,
      llm_suggested_target = EXCLUDED.llm_suggested_target,
      llm_model            = EXCLUDED.llm_model,
      llm_audit_version    = EXCLUDED.llm_audit_version,
      llm_checked_at       = EXCLUDED.llm_checked_at,
      last_seen_at         = EXCLUDED.last_seen_at,
      updated_at           = now()
    RETURNING pool_key`)) as unknown as Record<string, unknown>[];

  return result.length;
}

export interface VerdictWrite {
  poolKey: string;
  languageFrom: string;
  languageTo: string;
  textKnown: string;
  textTarget: string;
  verdict: QualityVerdict;
  suggestedKnown: string | null;
  suggestedTarget: string | null;
  suggestionNote: string | null;
  reviewedBy: string;
  heuristicVersion: number;
  /** Null when this pair has never been through the LLM audit. */
  llmAuditVersion: number | null;
}

/**
 * Record an editor's verdict.
 *
 * `suggestion_version` is bumped only when the suggestion's *content* changes.
 * That is what lets a learner who declined an earlier draft be shown an
 * improved one, while re-saving the same wording does not nag them again.
 *
 * Both check generations are snapshotted rather than one combined number: an
 * editor judges from heuristics, audio, the model, and their own knowledge, so
 * a single version would claim the verdict rested on something it may not have.
 */
export async function writeQualityVerdict(input: VerdictWrite): Promise<number> {
  const rows = (await db.execute(sql`
    INSERT INTO content_quality_reviews (
      pool_key, language_from, language_to, text_known, text_target,
      verdict, suggested_known, suggested_target, suggestion_note,
      suggestion_version, reviewed_by, reviewed_at,
      reviewed_heuristic_version, reviewed_llm_audit_version,
      last_seen_at, created_at, updated_at)
    VALUES (
      ${input.poolKey}, ${input.languageFrom}, ${input.languageTo},
      ${input.textKnown}, ${input.textTarget},
      ${input.verdict}, ${input.suggestedKnown}, ${input.suggestedTarget},
      ${input.suggestionNote},
      ${input.suggestedKnown === null && input.suggestedTarget === null ? 0 : 1},
      ${input.reviewedBy}, now(),
      ${input.heuristicVersion}, ${input.llmAuditVersion},
      now(), now(), now())
    ON CONFLICT (pool_key) DO UPDATE SET
      verdict          = EXCLUDED.verdict,
      suggested_known  = EXCLUDED.suggested_known,
      suggested_target = EXCLUDED.suggested_target,
      suggestion_note  = EXCLUDED.suggestion_note,
      suggestion_version = CASE
        WHEN content_quality_reviews.suggested_known IS DISTINCT FROM EXCLUDED.suggested_known
          OR content_quality_reviews.suggested_target IS DISTINCT FROM EXCLUDED.suggested_target
        THEN content_quality_reviews.suggestion_version + 1
        ELSE content_quality_reviews.suggestion_version
      END,
      reviewed_by = EXCLUDED.reviewed_by,
      reviewed_at = EXCLUDED.reviewed_at,
      reviewed_heuristic_version   = EXCLUDED.reviewed_heuristic_version,
      reviewed_llm_audit_version   = EXCLUDED.reviewed_llm_audit_version,
      updated_at  = now()
    RETURNING suggestion_version`)) as unknown as Record<string, unknown>[];

  return numberFrom((rows[0] ?? {}).suggestion_version);
}

/* ------------------------------------------------------------------ *
 * Suggestions, learner side
 * ------------------------------------------------------------------ */
