/**
 * Consent-gated quality-pool reads and row parsing.
 */

import { sql, type SQL } from 'drizzle-orm';
import { db } from '../client';
import type { QualityHeuristicFlag } from '@/lib/quality-flags';
import {
  itemPoolKey,
  poolNormalize,
  poolSourceCondition,
} from './quality-pool-shared';
import type {
  PoolAudioFilter,
  PoolAudioSide,
  PoolItem,
  PoolReview,
  PoolRow,
  PoolSort,
  QualityPoolOptions,
  QualityPoolPage,
} from './quality-pool-types';

/* ------------------------------------------------------------------ *
 * Row parsing
 * ------------------------------------------------------------------ */

function numberFrom(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function parseAssets(value: unknown): PoolAudioSide['assets'] {
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
function poolAggregateCte(): SQL {
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

/**
 * "This side still needs recording", per side.
 *
 * Deliberately the same condition `generatePoolAudio` acts on, not a narrower
 * "no audio at all": a pair recorded in 9 of its 10 items still has a learner
 * hearing nothing, and a legacy `r2` clip is linked and `ready` while the
 * serve route 404s for it. Both are gaps the repair fills, so both belong in
 * the filter an editor uses to queue that repair — otherwise selecting the
 * page and pressing the bulk button would skip exactly the rows it listed.
 */
function sideGapCondition(prefix: 'known' | 'target'): SQL {
  const ready = sql.raw(`p.${prefix}_ready_count`);
  const legacy = sql.raw(`p.${prefix}_legacy_count`);
  return sql`${ready} < p.occurrences OR ${legacy} > 0`;
}

function audioFilterCondition(filter: PoolAudioFilter): SQL | null {
  switch (filter) {
    case 'known_gap':
      return sql`(${sideGapCondition('known')})`;
    case 'target_gap':
      return sql`(${sideGapCondition('target')})`;
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
      // Every occurrence ready on both sides, with nothing legacy behind them.
      //
      // Two separate holes were here. Listing the failure states instead
      // (missing = 0 AND failed = 0) let a pair whose clips were still
      // `pending` pass as fully recorded — the statuses are an enum of four,
      // so only the positive form is exhaustive. And `ready` says nothing
      // about playability: a legacy `r2` asset is linked and ready while the
      // serve route 404s for it, which put such a pair in "Fully recorded" and
      // "Legacy" at once. `generatePoolAudio` already treats that case as a
      // gap to repair; this agrees with it.
      //
      // `legacy_count` keys on `storage_type = 'r2'`, which is marginally
      // broader than `isPlayableAudioAsset` (that one still accepts an r2 row
      // carrying an absolute http storage_ref). Matching the `legacy` bucket
      // is the point — a row must not sit in both filters.
      return sql`p.known_ready_count = p.occurrences
             AND p.target_ready_count = p.occurrences
             AND p.known_legacy_count = 0
             AND p.target_legacy_count = 0`;
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
      p.occurrences, p.list_count, p.topics,
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
      p.occurrences, p.list_count, p.topics,
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

/* ------------------------------------------------------------------ *
 * Items behind one pool row
 * ------------------------------------------------------------------ */

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
  ): PoolItem['knownAsset'] =>
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
