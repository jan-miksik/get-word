/**
 * PoolRow → wire DTO.
 *
 * Built field by field on purpose. The pool's entire value is that it does not
 * carry identity, and the cheapest way to lose that property is a spread that
 * silently forwards whatever a future query happens to select.
 */

import { isSuspiciousSizeForText } from '@/lib/audio-quality';
import { suspicionScore } from '@/lib/quality-flags';
import type { PoolAudioSide, PoolRow } from '@/lib/db/queries/quality-pool';
import type { QualityAudioSide, QualityPoolRow } from '@/features/admin/quality-types';
import { HEURISTIC_VERSION, LLM_AUDIT_VERSION } from './quality-versions';

/**
 * `text` is the side's own text, so the size heuristic is judged against the
 * words that were actually spoken. An asset only exists here when the query's
 * FILTER let it through, so a null size means "asset present, size unknown" —
 * genuinely worth a look — and never "there is no audio".
 */
function serializeSide(side: PoolAudioSide, text: string): QualityAudioSide {
  return {
    ready_count: side.readyCount,
    missing_count: side.missingCount,
    failed_count: side.failedCount,
    pending_count: side.pendingCount,
    legacy_count: side.legacyCount,
    assets: side.assets.map((asset) => ({
      id: asset.id,
      content_hash: asset.hash,
      size_bytes: asset.size,
      storage: asset.storage,
      suspicious: isSuspiciousSizeForText(asset.size, text),
    })),
  };
}

/**
 * True when an editor's verdict predates the current generation of whichever
 * check they had available. A row never audited by the LLM is not stale just
 * because the audit version moved — there was nothing to be out of date with.
 */
function isVerdictStale(row: PoolRow): boolean {
  const review = row.review;
  if (!review || review.verdict === 'unreviewed') return false;
  if (review.reviewedHeuristicVersion !== HEURISTIC_VERSION) return true;
  return (
    review.reviewedLlmAuditVersion !== null &&
    review.reviewedLlmAuditVersion !== LLM_AUDIT_VERSION
  );
}

export function serializeQualityRow(row: PoolRow): QualityPoolRow {
  const review = row.review;
  return {
    pool_key: row.poolKey,
    language_from: row.languageFrom,
    language_to: row.languageTo,
    text_known: row.textKnown,
    text_target: row.textTarget,
    occurrences: row.occurrences,
    list_count: row.listCount,
    topics: row.topics,
    ai_consent: row.aiConsent,
    known: serializeSide(row.known, row.textKnown),
    target: serializeSide(row.target, row.textTarget),
    heuristic_flags: review?.heuristicFlags ?? [],
    heuristic_version: review?.heuristicVersion ?? null,
    llm_score: review?.llmScore ?? null,
    llm_reason: review?.llmReason ?? null,
    llm_suggested_target: review?.llmSuggestedTarget ?? null,
    llm_audit_version: review?.llmAuditVersion ?? null,
    verdict: review?.verdict ?? 'unreviewed',
    reviewed_heuristic_version: review?.reviewedHeuristicVersion ?? null,
    reviewed_llm_audit_version: review?.reviewedLlmAuditVersion ?? null,
    suggested_known: review?.suggestedKnown ?? null,
    suggested_target: review?.suggestedTarget ?? null,
    suggestion_note: review?.suggestionNote ?? null,
    suggestion_version: review?.suggestionVersion ?? 0,
    reviewed_at: review?.reviewedAt ?? null,
    verdict_stale: isVerdictStale(row),
    suspicion: suspicionScore(review?.heuristicFlags ?? []),
  };
}
