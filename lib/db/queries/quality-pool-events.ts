/**
 * Editor action history for one pool pair.
 *
 * Append-only, and narrow on purpose: only what a human did — a verdict, a
 * suggestion, a recording filled or replaced. The scan and the LLM audit touch
 * thousands of rows per run and are left out, because a trail nobody can read
 * is the same as no trail.
 *
 * The pool's privacy rule holds here as well. The only user id stored is the
 * editor's, and `detail` carries counts — never an item id, a list id or an
 * owner id, which is exactly what would turn this table into a way to join
 * content back to the learner who wrote it.
 */

import { sql } from 'drizzle-orm';
import { db } from '../client';

type QualityEventAction =
  | 'verdict'
  | 'suggestion'
  | 'audio_filled'
  | 'audio_replaced';

export interface QualityEventWrite {
  poolKey: string;
  actorUserId: string | null;
  action: QualityEventAction;
  side?: 'known' | 'target' | null;
  detail?: Record<string, unknown>;
}

export interface QualityEventRow {
  id: string;
  action: QualityEventAction;
  side: 'known' | 'target' | null;
  detail: Record<string, unknown>;
  /** The editor's email, or null when the account is gone. */
  actorEmail: string | null;
  createdAt: string;
}

/**
 * Record one editor action.
 *
 * Never throws into the caller's path: the history is a convenience, and a
 * failed insert must not turn a recording that already happened into an error
 * the editor sees. The failure is logged instead.
 */
export async function recordQualityEvent(entry: QualityEventWrite): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO content_quality_events (pool_key, actor_user_id, action, side, detail)
      VALUES (
        ${entry.poolKey}, ${entry.actorUserId}, ${entry.action},
        ${entry.side ?? null}, ${JSON.stringify(entry.detail ?? {})}::jsonb)`);
  } catch (error) {
    console.error('Failed to record a quality pool event', error);
  }
}

const MAX_EVENTS = 100;

export async function getQualityEvents(
  poolKey: string,
  limit = MAX_EVENTS,
): Promise<QualityEventRow[]> {
  const rows = (await db.execute(sql`
    SELECT e.id, e.action, e.side, e.detail, e.created_at, u.email AS actor_email
    FROM content_quality_events e
    LEFT JOIN users u ON u.id = e.actor_user_id
    WHERE e.pool_key = ${poolKey}
    ORDER BY e.created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), MAX_EVENTS)}`)) as unknown as Record<
    string,
    unknown
  >[];

  return rows.map((row) => ({
    id: String(row.id),
    action: String(row.action) as QualityEventAction,
    side: (row.side ?? null) as QualityEventRow['side'],
    detail: (row.detail ?? {}) as Record<string, unknown>,
    actorEmail: row.actor_email === null || row.actor_email === undefined
      ? null
      : String(row.actor_email),
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}
