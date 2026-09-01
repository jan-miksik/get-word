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
  | 'ready'
  /** The known side still needs recording somewhere. */
  | 'known_gap'
  /** The target side still needs recording somewhere. */
  | 'target_gap';

export type QualitySort =
  | 'suspicion'
  | 'occurrences'
  | 'audio'
  | 'newest'
  | 'alphabetical';

type QualityAudioAsset = {
  id: string;
  /** Content hash — the key `/api/audio/:hash` serves by. */
  content_hash: string | null;
  size_bytes: number | null;
  storage: string | null;
  /** The voice on the clip; null when unknown (asset predates the column). */
  voice_id: string | null;
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
  model: string;
};

/**
 * Does this side still need recording? The client mirror of `sideGapCondition`
 * in `lib/db/queries/quality-pool.ts`, and of what `generatePoolAudio` will
 * actually act on.
 *
 * The three must agree. The row button, the `known_gap` / `target_gap` filters
 * and the bulk action are all driven by this, so a row the filter listed is a
 * row the button offers and the action changes — a mismatch shows up as a
 * bulk run that reports failures for rows the editor never chose.
 *
 * `ready_count < occurrences` covers a partly recorded pair; `legacy_count`
 * covers a clip that is linked and `ready` but unplayable (`r2`).
 */
export function hasAudioGap(side: QualityAudioSide, occurrences: number): boolean {
  return side.ready_count < occurrences || side.legacy_count > 0;
}

export type QualityAudioResult = {
  generated: boolean;
  linked_items: number;
  /** Of the linked items, how many already had a playable clip that was swapped. */
  replaced_items: number;
  /** Items sharing the pool key whose exact text was not audio-equivalent. */
  skipped_items: number;
  /** Items left untouched because they already had a playable clip. */
  kept_items: number;
  content_hash: string | null;
  /** The voice that spoke it — 'default' when Google was given no name. */
  voice_id: string | null;
  error?: string;
};

/**
 * How the pool should choose a voice.
 *
 * `auto` is the deterministic Chirp3-HD pick used for filling gaps. It is the
 * wrong choice for re-recording: the same text resolves to the same voice, so
 * the clip would hash identically and nothing would change. `random` is the
 * mix — a Chirp3-HD voice drawn at random, avoiding the ones the pair already
 * uses — and `explicit` names one.
 */
export type QualityVoiceRequest =
  | { mode: 'auto' }
  | { mode: 'random' }
  | { mode: 'explicit'; voiceId: string };

/** `fill` records only what is missing; `replace` overwrites existing clips. */
export type QualityAudioMode = 'fill' | 'replace';

export type QualityVoicesResponse = {
  language: string;
  /** False when Google has no voice at all for the language (e.g. Māori). */
  supported: boolean;
  voices: string[];
};

type QualityEventAction =
  | 'verdict'
  | 'suggestion'
  | 'audio_filled'
  | 'audio_replaced';

/**
 * One editor action on a pair.
 *
 * `actor` is an editor's email and `detail` holds counts — never an item id, a
 * list id or an owner id. The history must not become a way to join a pair
 * back to the learner who wrote it.
 */
export type QualityEvent = {
  id: string;
  action: QualityEventAction;
  side: 'known' | 'target' | null;
  detail: Record<string, unknown>;
  actor: string | null;
  created_at: string;
};

export type QualityHistoryResponse = {
  events: QualityEvent[];
};
