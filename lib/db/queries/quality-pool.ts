/**
 * The quality pool: every word pair in private owned lists, aggregated by
 * content so an editor can find missing audio and bad translations across the
 * whole corpus without ever seeing who wrote what.
 *
 * Consent is a two-key lock, and BOTH keys are checked in SQL rather than in
 * application code: `users.review_opt_in` (the account switch) AND
 * `word_lists.review_opt_in` (the per-list flag photo lab sets to false). The
 * LLM audit needs a third, stricter key — see `poolAiConsentExpression`.
 */

import { sql, type SQL } from 'drizzle-orm';
import { db } from '../client';
import {
  suspicionScore,
  type QualityHeuristicFlag,
  type QualityFlagCode,
} from '@/lib/quality-flags';

/* ------------------------------------------------------------------ *
 * The pool key
 * ------------------------------------------------------------------ */

/**
 * Text normalization, mirroring `normalizeText` in lib/progress-key.ts with
 * `ignoreCase: false`: NFC → trim → collapse whitespace → strip trailing dots
 * → trim again.
 *
 * Deliberately NOT the progress content key: that one folds per-item
 * `ignore_case` into the hash and carries different semantics. Mixing them
 * would silently merge pairs that progress treats as distinct.
 */
function poolNormalize(column: SQL): SQL {
  return sql`btrim(regexp_replace(regexp_replace(btrim(normalize(${column}, NFC)), '\\s+', ' ', 'g'), '\\.+$', ''))`;
}

/**
 * `p1:` + md5 over a LENGTH-PREFIXED serialization of the four values.
 *
 * The length prefixes are the point: with a bare separator, ("ab|c", "d") and
 * ("ab", "c|d") would hash the same input. `len:value|len:value|…` cannot be
 * parsed two ways, so distinct quadruples always produce distinct input. A NUL
 * separator is not an option — PostgreSQL `text` cannot hold one.
 *
 * `p1:` versions the key scheme itself. If the normalization or serialization
 * ever changes, bump it so old rows are visibly different instead of quietly
 * disagreeing with new ones.
 *
 * This is the ONLY definition. The listing query, the scan, the verdict write,
 * the purge, and the learner-facing suggestion lookup all call it, which is
 * what keeps them from drifting apart.
 */
export function poolKeyExpression(
  languageFrom: SQL,
  languageTo: SQL,
  textKnown: SQL,
  textTarget: SQL,
): SQL {
  const lf = sql`lower(${languageFrom})`;
  const lt = sql`lower(${languageTo})`;
  const k = poolNormalize(textKnown);
  const t = poolNormalize(textTarget);
  return sql`'p1:' || md5(concat_ws('|',
    char_length(${lf}) || ':' || ${lf},
    char_length(${lt}) || ':' || ${lt},
    char_length(${k}) || ':' || ${k},
    char_length(${t}) || ':' || ${t}
  ))`;
}

/** The pool key for a `word_list_items i` joined to `word_lists l`. */
export function itemPoolKey(itemAlias = 'i', listAlias = 'l'): SQL {
  const i = sql.raw(itemAlias);
  const l = sql.raw(listAlias);
  return poolKeyExpression(
    sql`${l}.language_from`,
    sql`${l}.language_to`,
    sql`${i}.text_known`,
    sql`${i}.text_target`,
  );
}

/* ------------------------------------------------------------------ *
 * Consent
 * ------------------------------------------------------------------ */

/**
 * Rows eligible for the pool at all. Private owned lists only, with both
 * halves of the consent, and a pair that actually has both sides.
 *
 * Kept as one expression so no caller can accidentally build a pool query
 * that forgets one of the conditions.
 */
export function poolSourceCondition(
  itemAlias = 'i',
  listAlias = 'l',
  userAlias = 'u',
): SQL {
  const i = sql.raw(itemAlias);
  const l = sql.raw(listAlias);
  const u = sql.raw(userAlias);
  return sql`${l}.is_public = false
    AND ${l}.owner_id IS NOT NULL
    AND ${l}.review_opt_in = true
    AND ${u}.review_opt_in = true
    AND ${i}.text_target IS NOT NULL
    AND btrim(${i}.text_target) <> ''
    AND btrim(${i}.text_known) <> ''`;
}

/**
 * Whether a pair may leave for a third-party model. `bool_and` over every
 * owner contributing to the pair: one owner without the AI consent blocks the
 * whole aggregated row, because we cannot send "part of" a pair.
 */
export function poolAiConsentExpression(userAlias = 'u'): SQL {
  return sql`bool_and(${sql.raw(userAlias)}.ai_review_opt_in)`;
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type PoolAudioAsset = {
  id: string;
  /** `media_assets.content_hash` — what `/api/audio/:hash` is keyed by. */
  hash: string | null;
  size: number | null;
  storage: string | null;
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
  aiConsent: boolean;
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
  verdict: 'unreviewed' | 'ok' | 'suspect' | 'suggested';
  reviewedHeuristicVersion: number | null;
  reviewedLlmAuditVersion: number | null;
  suggestedKnown: string | null;
  suggestedTarget: string | null;
  suggestionNote: string | null;
  suggestionVersion: number;
  reviewedAt: string | null;
  lastSeenAt: string | null;
};

export type PoolAudioFilter = 'any' | 'missing' | 'failed' | 'legacy' | 'incomplete' | 'ready';

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

/* ------------------------------------------------------------------ *
 * Row parsing
 * ------------------------------------------------------------------ */

function numberFrom(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function parseAssets(value: unknown): PoolAudioAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string') return [];
    return [
      {
        id: record.id,
        hash: typeof record.hash === 'string' ? record.hash : null,
        size: record.size === null || record.size === undefined ? null : Number(record.size),
        storage: typeof record.storage === 'string' ? record.storage : null,
      },
    ];
  });
}

function parseSide(row: Record<string, unknown>, prefix: 'known' | 'target'): PoolAudioSide {
  return {
    readyCount: numberFrom(row[`${prefix}_ready_count`]),
    missingCount: numberFrom(row[`${prefix}_missing_count`]),
    failedCount: numberFrom(row[`${prefix}_failed_count`]),
    pendingCount: numberFrom(row[`${prefix}_pending_count`]),
    legacyCount: numberFrom(row[`${prefix}_legacy_count`]),
    assets: parseAssets(row[`${prefix}_assets`]),
  };
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseFlags(value: unknown): QualityHeuristicFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is QualityHeuristicFlag =>
      !!entry && typeof entry === 'object' && typeof (entry as { code?: unknown }).code === 'string',
  );
}

function parseReview(row: Record<string, unknown>): PoolReview | null {
  if (!row.verdict) return null;
  return {
    heuristicFlags: parseFlags(row.heuristic_flags),
    heuristicVersion: row.heuristic_version === null ? null : numberFrom(row.heuristic_version),
    heuristicScannedAt: isoOrNull(row.heuristic_scanned_at),
    llmScore: row.llm_score === null || row.llm_score === undefined ? null : numberFrom(row.llm_score),
    llmReason: (row.llm_reason as string | null) ?? null,
    llmSuggestedTarget: (row.llm_suggested_target as string | null) ?? null,
    llmModel: (row.llm_model as string | null) ?? null,
    llmAuditVersion:
      row.llm_audit_version === null || row.llm_audit_version === undefined
        ? null
        : numberFrom(row.llm_audit_version),
    llmCheckedAt: isoOrNull(row.llm_checked_at),
    verdict: row.verdict as PoolReview['verdict'],
    reviewedHeuristicVersion:
      row.reviewed_heuristic_version === null || row.reviewed_heuristic_version === undefined
        ? null
        : numberFrom(row.reviewed_heuristic_version),
    reviewedLlmAuditVersion:
      row.reviewed_llm_audit_version === null || row.reviewed_llm_audit_version === undefined
        ? null
        : numberFrom(row.reviewed_llm_audit_version),
    suggestedKnown: (row.suggested_known as string | null) ?? null,
    suggestedTarget: (row.suggested_target as string | null) ?? null,
    suggestionNote: (row.suggestion_note as string | null) ?? null,
    suggestionVersion: numberFrom(row.suggestion_version),
    reviewedAt: isoOrNull(row.reviewed_at),
    lastSeenAt: isoOrNull(row.last_seen_at),
  };
}

function parseRow(row: Record<string, unknown>): PoolRow {
  return {
    poolKey: String(row.pool_key),
    languageFrom: String(row.language_from ?? ''),
    languageTo: String(row.language_to ?? ''),
    textKnown: String(row.text_known ?? ''),
    textTarget: String(row.text_target ?? ''),
    normKnown: String(row.norm_known ?? ''),
    normTarget: String(row.norm_target ?? ''),
    occurrences: numberFrom(row.occurrences),
    listCount: numberFrom(row.list_count),
    topics: Array.isArray(row.topics) ? row.topics.map(String) : [],
    aiConsent: row.ai_consent === true,
    known: parseSide(row, 'known'),
    target: parseSide(row, 'target'),
    review: parseReview(row),
  };
}

/* ------------------------------------------------------------------ *
 * The aggregate
 * ------------------------------------------------------------------ */

/**
 * One side's audio aggregate.
 *
 * `FILTER (WHERE …id IS NOT NULL)` plus the `COALESCE` are load-bearing, not
 * tidiness: without them a LEFT JOIN miss produces `[{"id":null,…}]` instead
 * of `[]`, and since `isSuspiciousSizeForText(null, text)` returns true
 * ("unknown size — look at it"), a pair with NO audio would be reported as a
 * pair with SUSPICIOUS audio. Those must stay distinguishable.
 */
function audioSideColumns(prefix: 'known' | 'target', statusColumn: string, assetAlias: string): SQL {
  const status = sql.raw(`i.${statusColumn}`);
  const asset = sql.raw(assetAlias);
  const name = sql.raw(prefix);
  return sql`
    count(*) FILTER (WHERE ${status} = 'ready')::int   AS ${name}_ready_count,
    count(*) FILTER (WHERE ${status} = 'none')::int    AS ${name}_missing_count,
    count(*) FILTER (WHERE ${status} = 'failed')::int  AS ${name}_failed_count,
    count(*) FILTER (WHERE ${status} = 'pending')::int AS ${name}_pending_count,
    count(*) FILTER (WHERE ${asset}.storage_type = 'r2')::int AS ${name}_legacy_count,
    COALESCE(
      jsonb_agg(DISTINCT jsonb_build_object(
        'id', ${asset}.id,
        'hash', ${asset}.content_hash,
        'size', ${asset}.size_bytes,
        'storage', ${asset}.storage_type
      )) FILTER (WHERE ${asset}.id IS NOT NULL),
      '[]'::jsonb
    ) AS ${name}_assets`;
}

/** The `pool` CTE: every eligible item folded into one row per pair. */
export function poolAggregateCte(): SQL {
  return sql`
    pool AS (
      SELECT
        ${itemPoolKey()} AS pool_key,
        min(l.language_from) AS language_from,
        min(l.language_to)   AS language_to,
        -- Displayed spelling = the MODAL exact variant, not min(). The group
        -- folds case/whitespace/trailing-dot differences together, and the
        -- alphabetically first variant can easily be a one-off typo.
        mode() WITHIN GROUP (ORDER BY i.text_known)  AS text_known,
        mode() WITHIN GROUP (ORDER BY i.text_target) AS text_target,
        -- Normalized forms. Every row in the group shares them by definition
        -- (that is what the group key is), so min() is exact, not a sample.
        -- The corpus heuristics key on these, not on the modal spelling.
        min(${poolNormalize(sql`i.text_known`)})  AS norm_known,
        min(${poolNormalize(sql`i.text_target`)}) AS norm_target,
        count(*)::int AS occurrences,
        count(DISTINCT i.list_id)::int AS list_count,
        COALESCE(
          array_agg(DISTINCT c.review_label) FILTER (WHERE c.review_label IS NOT NULL),
          '{}'::text[]
        ) AS topics,
        ${poolAiConsentExpression()} AS ai_consent,
        ${audioSideColumns('known', 'known_audio_status', 'ka')},
        ${audioSideColumns('target', 'audio_status', 'ta')}
      FROM word_list_items i
      JOIN word_lists l ON l.id = i.list_id
      JOIN users u      ON u.id = l.owner_id
      LEFT JOIN word_categories c ON c.id = i.category_id
      LEFT JOIN media_assets ka   ON ka.id = i.known_audio_asset_id
      LEFT JOIN media_assets ta   ON ta.id = i.audio_asset_id
      WHERE ${poolSourceCondition()}
      GROUP BY 1
    )`;
}

function audioFilterCondition(filter: PoolAudioFilter): SQL | null {
  switch (filter) {
    case 'missing':
      // No audio at all on either side.
      return sql`p.known_ready_count = 0 AND p.target_ready_count = 0`;
    case 'incomplete':
      // Some items have it, some do not — the case a boolean would have hidden.
      // Stated as "ready, but not all of them" rather than by counting the ways
      // an item can lack audio, so `pending` cannot slip through as complete.
      return sql`(p.known_ready_count > 0 AND p.known_ready_count < p.occurrences)
              OR (p.target_ready_count > 0 AND p.target_ready_count < p.occurrences)`;
    case 'failed':
      return sql`p.known_failed_count > 0 OR p.target_failed_count > 0`;
    case 'legacy':
      return sql`p.known_legacy_count > 0 OR p.target_legacy_count > 0`;
    case 'ready':
      // Every occurrence ready on both sides. Listing the failure states
      // instead (missing = 0 AND failed = 0) let a pair whose clips were still
      // `pending` pass as fully recorded — the statuses are an enum of four, so
      // only the positive form is exhaustive.
      return sql`p.known_ready_count = p.occurrences
             AND p.target_ready_count = p.occurrences`;
    case 'any':
    default:
      return null;
  }
}

function buildFilters(options: QualityPoolOptions): SQL {
  const conditions: SQL[] = [];

  if (options.languageFrom) {
    conditions.push(sql`lower(p.language_from) = lower(${options.languageFrom})`);
  }
  if (options.languageTo) {
    conditions.push(sql`lower(p.language_to) = lower(${options.languageTo})`);
  }
  if (options.poolKeys) {
    // An empty list means "none of them", never "all of them" — a caller that
    // asked for specific pairs and named none must not get the whole pool.
    conditions.push(
      options.poolKeys.length === 0
        ? sql`FALSE`
        : sql`p.pool_key = ANY(${sql`ARRAY[${sql.join(
            options.poolKeys.map((key) => sql`${key}`),
            sql`, `,
          )}]::text[]`})`,
    );
  }
  if (options.search && options.search.trim() !== '') {
    const needle = `%${options.search.trim()}%`;
    conditions.push(sql`(p.text_known ILIKE ${needle} OR p.text_target ILIKE ${needle})`);
  }

  const audio = audioFilterCondition(options.audio ?? 'any');
  if (audio) conditions.push(audio);

  if (options.flags && options.flags.length > 0) {
    // `?|` asks whether any of these codes appears; the flags are stored as
    // objects, so we project the codes first.
    conditions.push(sql`EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.heuristic_flags, '[]'::jsonb)) AS f
      WHERE f->>'code' = ANY(${sql`ARRAY[${sql.join(
        options.flags.map((code) => sql`${code}`),
        sql`, `,
      )}]::text[]`})
    )`);
  }

  if (options.verdict && options.verdict !== 'any') {
    conditions.push(
      options.verdict === 'unreviewed'
        ? sql`COALESCE(r.verdict, 'unreviewed') = 'unreviewed'`
        : sql`r.verdict = ${options.verdict}`,
    );
  }

  if (typeof options.maxLlmScore === 'number') {
    conditions.push(sql`r.llm_score IS NOT NULL AND r.llm_score <= ${options.maxLlmScore}`);
  }

  if (options.staleOnly) {
    // Never checked, or checked by an older generation of the rules.
    conditions.push(sql`(
      r.pool_key IS NULL
      OR r.heuristic_version IS DISTINCT FROM ${options.staleOnly.heuristicVersion}
      OR (r.llm_audit_version IS NOT NULL
          AND r.llm_audit_version IS DISTINCT FROM ${options.staleOnly.llmAuditVersion})
    )`);
  }

  if (conditions.length === 0) return sql`TRUE`;
  return sql.join(conditions, sql` AND `);
}

function buildOrder(sort: PoolSort): SQL {
  switch (sort) {
    case 'occurrences':
      return sql`p.occurrences DESC, p.text_known ASC`;
    case 'audio':
      // Worst first: failures, then gaps, then everything else.
      return sql`(p.known_failed_count + p.target_failed_count) DESC,
                 (p.known_missing_count + p.target_missing_count) DESC,
                 p.occurrences DESC`;
    case 'newest':
      return sql`COALESCE(r.created_at, now()) DESC, p.text_known ASC`;
    case 'alphabetical':
      return sql`p.text_known ASC, p.text_target ASC`;
    case 'suspicion':
    default:
      // Notice-level flags contribute 0 in `suspicionScore`, and the same
      // weighting is mirrored here so the server sort agrees with the client
      // score. High-weight codes first, then a low LLM score, then frequency.
      return sql`(
        SELECT COALESCE(sum(CASE f->>'weight'
          WHEN 'high' THEN 5 WHEN 'medium' THEN 2 ELSE 0 END), 0)
        FROM jsonb_array_elements(COALESCE(r.heuristic_flags, '[]'::jsonb)) AS f
      ) DESC,
      COALESCE(r.llm_score, 101) ASC,
      p.occurrences DESC`;
  }
}

const MAX_LIMIT = 200;

/**
 * One page of the pool.
 *
 * Server-side paging is new here: every other admin list in this repo is
 * fetched whole and sorted in the browser, which does not survive a
 * corpus-wide table.
 */
export async function getQualityPool(
  options: QualityPoolOptions = {},
): Promise<QualityPoolPage> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters = buildFilters(options);
  const order = buildOrder(options.sort ?? 'suspicion');

  const rowsQuery = sql`
    WITH ${poolAggregateCte()}
    SELECT
      p.pool_key, p.language_from, p.language_to,
      p.text_known, p.text_target, p.norm_known, p.norm_target,
      p.occurrences, p.list_count, p.topics, p.ai_consent,
      p.known_ready_count, p.known_missing_count, p.known_failed_count,
      p.known_pending_count, p.known_legacy_count, p.known_assets,
      p.target_ready_count, p.target_missing_count, p.target_failed_count,
      p.target_pending_count, p.target_legacy_count, p.target_assets,
      r.heuristic_flags, r.heuristic_version, r.heuristic_scanned_at,
      r.llm_score, r.llm_reason, r.llm_suggested_target, r.llm_model,
      r.llm_audit_version, r.llm_checked_at,
      r.verdict, r.reviewed_heuristic_version, r.reviewed_llm_audit_version,
      r.suggested_known, r.suggested_target, r.suggestion_note,
      r.suggestion_version, r.reviewed_at, r.last_seen_at
    FROM pool p
    LEFT JOIN content_quality_reviews r ON r.pool_key = p.pool_key
    WHERE ${filters}
    ORDER BY ${order}
    LIMIT ${limit} OFFSET ${offset}`;

  const countQuery = sql`
    WITH ${poolAggregateCte()}
    SELECT count(*)::int AS total
    FROM pool p
    LEFT JOIN content_quality_reviews r ON r.pool_key = p.pool_key
    WHERE ${filters}`;

  const [rows, countRows] = await Promise.all([
    db.execute(rowsQuery) as unknown as Promise<Record<string, unknown>[]>,
    db.execute(countQuery) as unknown as Promise<Record<string, unknown>[]>,
  ]);

  return {
    rows: rows.map(parseRow),
    total: numberFrom((countRows[0] ?? {}).total),
    limit,
    offset,
  };
}

/**
 * A single pool row by its key, or null.
 *
 * Goes through the same consent-gated aggregate as the listing, so an editor
 * cannot reach a pair by guessing a key that the pool would never have shown
 * them in the first place.
 */
export async function getQualityPoolRow(poolKey: string): Promise<PoolRow | null> {
  const rows = (await db.execute(sql`
    WITH ${poolAggregateCte()}
    SELECT
      p.pool_key, p.language_from, p.language_to,
      p.text_known, p.text_target, p.norm_known, p.norm_target,
      p.occurrences, p.list_count, p.topics, p.ai_consent,
      p.known_ready_count, p.known_missing_count, p.known_failed_count,
      p.known_pending_count, p.known_legacy_count, p.known_assets,
      p.target_ready_count, p.target_missing_count, p.target_failed_count,
      p.target_pending_count, p.target_legacy_count, p.target_assets,
      r.heuristic_flags, r.heuristic_version, r.heuristic_scanned_at,
      r.llm_score, r.llm_reason, r.llm_suggested_target, r.llm_model,
      r.llm_audit_version, r.llm_checked_at,
      r.verdict, r.reviewed_heuristic_version, r.reviewed_llm_audit_version,
      r.suggested_known, r.suggested_target, r.suggestion_note,
      r.suggestion_version, r.reviewed_at, r.last_seen_at
    FROM pool p
    LEFT JOIN content_quality_reviews r ON r.pool_key = p.pool_key
    WHERE p.pool_key = ${poolKey}
    LIMIT 1`)) as unknown as Record<string, unknown>[];

  const row = rows[0];
  return row ? parseRow(row) : null;
}

/** Sort key used by the UI; kept next to the SQL order so the two agree. */
export function rowSuspicion(row: PoolRow): number {
  return row.review ? suspicionScore(row.review.heuristicFlags) : 0;
}

/* ------------------------------------------------------------------ *
 * Items behind one pool row
 * ------------------------------------------------------------------ */

/**
 * Enough of a media asset to decide whether it is worth keeping.
 *
 * `isPlayableAudioAsset` is the judge, and it reads exactly these fields — a
 * legacy `r2` row is linked but unplayable, so an item can be `ready` and
 * still have nothing a learner can hear.
 */
export type PoolItemAsset = {
  contentHash: string;
  storageType: string;
  storageRef: string;
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

/**
 * The individual items a pool row aggregates.
 *
 * The audio action needs these for three things the aggregate cannot give it:
 * choosing a canonical spelling from the real variants, checking each item's
 * own text before linking a shared clip to it, and seeing whether the item
 * already has a playable clip that must not be overwritten.
 *
 * Still gated by the same consent condition — this returns item ids, so it is
 * the one query in the pool that could leak reach beyond what a learner
 * allowed if the gate were dropped.
 */
export async function getPoolItems(poolKey: string): Promise<PoolItem[]> {
  const rows = (await db.execute(sql`
    SELECT i.id, i.list_id, i.text_known, i.text_target,
           l.language_from, l.language_to,
           i.known_audio_status, i.audio_status,
           ka.content_hash AS known_hash, ka.storage_type AS known_storage,
           ka.storage_ref  AS known_ref,
           ta.content_hash AS target_hash, ta.storage_type AS target_storage,
           ta.storage_ref  AS target_ref
    FROM word_list_items i
    JOIN word_lists l ON l.id = i.list_id
    JOIN users u      ON u.id = l.owner_id
    LEFT JOIN media_assets ka ON ka.id = i.known_audio_asset_id
    LEFT JOIN media_assets ta ON ta.id = i.audio_asset_id
    WHERE ${poolSourceCondition()}
      AND ${itemPoolKey()} = ${poolKey}`)) as unknown as Record<string, unknown>[];

  const asset = (
    row: Record<string, unknown>,
    prefix: 'known' | 'target',
  ): PoolItemAsset | null =>
    row[`${prefix}_storage`] === null || row[`${prefix}_storage`] === undefined
      ? null
      : {
          contentHash: String(row[`${prefix}_hash`] ?? ''),
          storageType: String(row[`${prefix}_storage`]),
          storageRef: String(row[`${prefix}_ref`] ?? ''),
        };

  return rows.map((row) => ({
    itemId: String(row.id),
    listId: String(row.list_id),
    textKnown: String(row.text_known ?? ''),
    textTarget: String(row.text_target ?? ''),
    languageFrom: String(row.language_from ?? ''),
    languageTo: String(row.language_to ?? ''),
    knownAudioStatus: String(row.known_audio_status ?? 'none'),
    targetAudioStatus: String(row.audio_status ?? 'none'),
    knownAsset: asset(row, 'known'),
    targetAsset: asset(row, 'target'),
  }));
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

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
  verdict: PoolReview['verdict'];
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

export type ListSuggestion = {
  itemId: string;
  poolKey: string;
  suggestionVersion: number;
  currentTarget: string;
  suggestedKnown: string | null;
  suggestedTarget: string | null;
  note: string | null;
};

/**
 * Correction suggestions waiting for the owner of one list.
 *
 * Deliberately NOT part of `/api/sync`. Suggestions are shown only in the list
 * editor, so putting them in the sync payload would grow every client's
 * download and force a `contentRev` bump for an admin edit most people never
 * see.
 *
 * Requires the consent to still be live — both halves. Someone who switches
 * quality review off stops seeing suggestions that came from it, which keeps
 * the switch meaning one thing rather than two.
 */
export async function getListQualitySuggestions(
  listId: string,
  userId: string,
): Promise<ListSuggestion[]> {
  const rows = (await db.execute(sql`
    SELECT i.id AS item_id, i.text_target AS current_target,
           r.pool_key, r.suggestion_version,
           r.suggested_known, r.suggested_target, r.suggestion_note
    FROM word_list_items i
    JOIN word_lists l ON l.id = i.list_id
    JOIN users u      ON u.id = l.owner_id
    JOIN content_quality_reviews r ON r.pool_key = ${itemPoolKey()}
    WHERE i.list_id = ${listId}
      AND l.owner_id = ${userId}
      AND ${poolSourceCondition()}
      AND r.verdict = 'suggested'
      AND (r.suggested_known IS NOT NULL OR r.suggested_target IS NOT NULL)
      -- Declining a suggestion silences that version only; an improved one
      -- carries a higher version and surfaces again.
      AND NOT EXISTS (
        SELECT 1 FROM content_quality_dismissals d
        WHERE d.user_id = ${userId}
          AND d.pool_key = r.pool_key
          AND d.suggestion_version >= r.suggestion_version)`)) as unknown as Record<
    string,
    unknown
  >[];

  return rows.map((row) => ({
    itemId: String(row.item_id),
    poolKey: String(row.pool_key),
    suggestionVersion: numberFrom(row.suggestion_version),
    currentTarget: String(row.current_target ?? ''),
    suggestedKnown: (row.suggested_known as string | null) ?? null,
    suggestedTarget: (row.suggested_target as string | null) ?? null,
    note: (row.suggestion_note as string | null) ?? null,
  }));
}

/** Record that this learner declined a specific version of a suggestion. */
export async function dismissQualitySuggestion(
  userId: string,
  poolKey: string,
  suggestionVersion: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO content_quality_dismissals (user_id, pool_key, suggestion_version)
    VALUES (${userId}, ${poolKey}, ${suggestionVersion})
    ON CONFLICT DO NOTHING`);
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export interface PurgeOptions {
  /** Grace after a pair disappears, so a re-added word is not recomputed. */
  graceDays?: number;
}

/**
 * Delete review rows whose pair no longer exists in any participating list.
 *
 * Existence-based ON PURPOSE. An earlier design deleted by a `last_seen_at`
 * timestamp refreshed during the scan — but the scan runs with a limit, so
 * after `--limit 50` against a 10,000-pair pool the other 9,950 rows look
 * stale and would be destroyed. Nothing here depends on how much the scan
 * happened to cover: either a live source row exists or it does not.
 *
 * Never call this as a step of a scan. It is its own command.
 */
export async function purgeStaleQualityReviews(
  options: PurgeOptions = {},
): Promise<number> {
  const graceDays = Math.max(options.graceDays ?? 30, 0);
  const result = (await db.execute(sql`
    DELETE FROM content_quality_reviews r
    WHERE NOT EXISTS (
            SELECT 1
            FROM word_list_items i
            JOIN word_lists l ON l.id = i.list_id
            JOIN users u      ON u.id = l.owner_id
            WHERE ${poolSourceCondition()}
              AND ${itemPoolKey()} = r.pool_key)
      AND r.updated_at < now() - (${graceDays} * interval '1 day')
      -- A suggestion still waiting on its learner outlives the grace period.
      AND NOT (
        r.verdict = 'suggested'
        AND NOT EXISTS (
          SELECT 1 FROM content_quality_dismissals d
          WHERE d.pool_key = r.pool_key
            AND d.suggestion_version >= r.suggestion_version))
    RETURNING r.pool_key`)) as unknown as Record<string, unknown>[];
  return result.length;
}

/**
 * Refresh `last_seen_at` for the pairs the scan just visited. Informational
 * only — nothing deletes by it.
 */
export async function touchQualityReviews(poolKeys: string[]): Promise<void> {
  if (poolKeys.length === 0) return;
  await db.execute(sql`
    UPDATE content_quality_reviews
    SET last_seen_at = now()
    WHERE pool_key = ANY(${sql`ARRAY[${sql.join(
      poolKeys.map((key) => sql`${key}`),
      sql`, `,
    )}]::text[]`})`);
}
