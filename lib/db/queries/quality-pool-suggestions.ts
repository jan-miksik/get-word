/**
 * Learner-facing suggestions and quality-review lifecycle cleanup.
 */

import { sql } from 'drizzle-orm';
import { db } from '../client';
import {
  itemPoolKey,
  poolSourceCondition,
} from './quality-pool-shared';

function numberFrom(value: unknown): number {
  return Number(value ?? 0) || 0;
}

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

