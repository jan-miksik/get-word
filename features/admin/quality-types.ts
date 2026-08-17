/**
 * Wire contract for the quality pool admin page.
 *
 * Mirrors `lib/db/queries/quality-pool.ts` in snake_case. Assembled from an
 * explicit field list, never by spreading a database row — the pool exists to
 * withhold identity, and a spread is how an owner id eventually leaks into a
 * response nobody re-read.
 */

import type { QualityFlagCode, QualityHeuristicFlag } from '@/lib/quality-flags';

export type QualityVerdict = 'unreviewed' | 'ok' | 'suspect' | 'suggested';

export type QualityAudioFilter =
  | 'any'
  | 'missing'
  | 'incomplete'
  | 'failed'
  | 'legacy'
  | 'ready';

export type QualitySort =
  | 'suspicion'
  | 'occurrences'
  | 'audio'
  | 'newest'
  | 'alphabetical';

export type QualityAudioAsset = {
  id: string;
  /** Content hash — the key `/api/audio/:hash` serves by. */
  content_hash: string | null;
  size_bytes: number | null;
  storage: string | null;
  /** Derived client-side from `isSuspiciousSizeForText`, not stored. */
  suspicious: boolean;
};

export type QualityAudioSide = {
  ready_count: number;
  missing_count: number;
  failed_count: number;
  pending_count: number;
  legacy_count: number;
  assets: QualityAudioAsset[];
};

export type QualityPoolRow = {
  pool_key: string;
  language_from: string;
  language_to: string;
  text_known: string;
  text_target: string;
  occurrences: number;
  /** A count only. List ids never leave the database. */
  list_count: number;
  topics: string[];
  /** Every owner of this pair allows the third-party AI audit. */
  ai_consent: boolean;
  known: QualityAudioSide;
  target: QualityAudioSide;
  heuristic_flags: QualityHeuristicFlag[];
  heuristic_version: number | null;
  llm_score: number | null;
  llm_reason: string | null;
  llm_suggested_target: string | null;
  llm_audit_version: number | null;
  verdict: QualityVerdict;
  /** What the editor's verdict was based on; null LLM = never audited. */
  reviewed_heuristic_version: number | null;
  reviewed_llm_audit_version: number | null;
  suggested_known: string | null;
  suggested_target: string | null;
  suggestion_note: string | null;
  suggestion_version: number;
  reviewed_at: string | null;
  /** True when a newer generation of the checks has run since the verdict. */
  verdict_stale: boolean;
  suspicion: number;
};

export type QualityPoolResponse = {
  rows: QualityPoolRow[];
  total: number;
  limit: number;
  offset: number;
  /** Current generations, so the UI can label a stale verdict precisely. */
  heuristic_version: number;
  llm_audit_version: number;
};

export type QualityPoolQuery = {
  languageFrom?: string;
  languageTo?: string;
  search?: string;
  audio?: QualityAudioFilter;
  flags?: QualityFlagCode[];
  verdict?: QualityVerdict | 'any';
  maxLlmScore?: number;
  staleOnly?: boolean;
  sort?: QualitySort;
  limit?: number;
  offset?: number;
};

export type QualityScanResult = {
  scanned: number;
  flagged: number;
  unchanged: number;
  next_offset: number | null;
};

export type QualityAuditResult = {
  audited: number;
  cached: number;
  /** Pairs left out because an owner has not allowed third-party AI review. */
  skipped_no_consent: number;
  model: string;
};

export type QualityAudioResult = {
  generated: boolean;
  linked_items: number;
  /** Items sharing the pool key whose exact text was not audio-equivalent. */
  skipped_items: number;
  content_hash: string | null;
  error?: string;
};
