/**
 * Public DTOs and query options for the content quality pool.
 *
 * The facade re-exports the consumer-facing types; PoolReview stays internal
 * to query/write implementation even though PoolRow structurally contains it.
 */

import type {
  QualityHeuristicFlag,
  QualityFlagCode,
} from '@/lib/quality-flags';
import type { QualityVerdict } from './quality-pool-shared';

type PoolAudioAsset = {
  id: string;
  /** `media_assets.content_hash` — what `/api/audio/:hash` is keyed by. */
  hash: string | null;
  size: number | null;
  storage: string | null;
  /** The voice that produced it; null on assets predating the column. */
  voice: string | null;
};

/**
 * Audio state for one side of a pair. Counts, not booleans: a pair present in
 * 20 items where 10 have audio and 10 do not is neither "ready" nor "missing",
 * and collapsing that to a flag makes a half-done pair look finished.
 */
export type PoolAudioSide = {
  readyCount: number;
  missingCount: number;
  failedCount: number;
  pendingCount: number;
  /** `storage_type = 'r2'` — linked but not playable (isPlayableAudioAsset). */
  legacyCount: number;
  /** Distinct assets behind this side; usually one, since the text matches. */
  assets: PoolAudioAsset[];
};

export type PoolRow = {
  poolKey: string;
  languageFrom: string;
  languageTo: string;
  textKnown: string;
  textTarget: string;
  /** Normalized forms — what the corpus heuristics and the pool key key on. */
  normKnown: string;
  normTarget: string;
  /** Item count, i.e. how many times this pair is being studied. */
  occurrences: number;
  /** Distinct lists. A count only — list ids never leave the database. */
  listCount: number;
  /** Neutral, PII-free topic labels from `word_categories.review_label`. */
  topics: string[];
  known: PoolAudioSide;
  target: PoolAudioSide;
  review: PoolReview | null;
};

export type PoolReview = {
  heuristicFlags: QualityHeuristicFlag[];
  heuristicVersion: number | null;
  heuristicScannedAt: string | null;
  llmScore: number | null;
  llmReason: string | null;
  llmSuggestedTarget: string | null;
  llmModel: string | null;
  llmAuditVersion: number | null;
  llmCheckedAt: string | null;
  verdict: QualityVerdict;
  reviewedHeuristicVersion: number | null;
  reviewedLlmAuditVersion: number | null;
  suggestedKnown: string | null;
  suggestedTarget: string | null;
  suggestionNote: string | null;
  suggestionVersion: number;
  reviewedAt: string | null;
  lastSeenAt: string | null;
};

export type PoolAudioFilter =
  | 'any'
  | 'missing'
  | 'failed'
  | 'legacy'
  | 'incomplete'
  | 'ready'
  | 'known_gap'
  | 'target_gap';

export type PoolSort =
  | 'suspicion'
  | 'occurrences'
  | 'audio'
  | 'newest'
  | 'alphabetical';

export interface QualityPoolOptions {
  languageFrom?: string;
  languageTo?: string;
  /**
   * Restrict to these exact pairs. Filtering in SQL rather than trimming a
   * page afterwards: a key outside whatever page happened to be fetched would
   * otherwise vanish without a word.
   */
  poolKeys?: string[];
  search?: string;
  audio?: PoolAudioFilter;
  /** Only rows carrying at least one of these heuristic codes. */
  flags?: QualityFlagCode[];
  verdict?: PoolReview['verdict'] | 'any';
  /** Rows whose LLM score is at or below this, when they have one. */
  maxLlmScore?: number;
  /** Rows judged by an older generation of the checks than the current one. */
  staleOnly?: { heuristicVersion: number; llmAuditVersion: number };
  sort?: PoolSort;
  limit?: number;
  offset?: number;
}

export interface QualityPoolPage {
  rows: PoolRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Enough of a media asset to decide whether it is worth keeping.
 *
 * `isPlayableAudioAsset` is the judge, and it reads exactly these fields — a
 * legacy `r2` row is linked but unplayable, so an item can be `ready` and
 * still have nothing a learner can hear.
 */
type PoolItemAsset = {
  contentHash: string;
  storageType: string;
  storageRef: string;
  /** The voice that produced the clip; null on assets predating the column. */
  voiceId: string | null;
};

export type PoolItem = {
  itemId: string;
  listId: string;
  /** The item's own exact spelling, before normalization. */
  textKnown: string;
  textTarget: string;
  languageFrom: string;
  languageTo: string;
  knownAudioStatus: string;
  targetAudioStatus: string;
  /** The clip each side currently points at, if any. */
  knownAsset: PoolItemAsset | null;
  targetAsset: PoolItemAsset | null;
};
