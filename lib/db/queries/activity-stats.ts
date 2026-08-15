import { sql } from 'drizzle-orm';

import type { ActivitySurface } from '@/packages/contracts/src/activity';
import { db } from '../client';
import {
  includedUserCondition,
  numberFromRow,
  sqlTextArray,
  type UserExclusions,
} from './stats-shared';

/**
 * Rollups over measured activity, kept out of `usage-stats.ts` so the later
 * user-facing "time studied today" can extend one module rather than fork the
 * SQL. That version has two requirements this one deliberately does not meet:
 *
 *  - **Interval union.** Everything here sums `active_ms`, which is device-time:
 *    three tabs and a phone active for the same ten minutes total forty minutes.
 *    That is honest for an operator dashboard and wrong for a learner, who must
 *    see the union of their intervals across devices. Every row stores
 *    [started_at, ended_at] precisely so that union is computable later.
 *  - **Local days.** Buckets here are UTC. A learner's "today" is their own
 *    timezone — Prague in summer starts its day at 22:00 UTC.
 */

export interface UserActivityTotals {
  userId: string;
  activeSeconds: number;
  sessions: number;
  medianSessionSeconds: number;
}

export interface SurfaceTotal {
  surface: ActivitySurface | string;
  activeSeconds: number;
  sessions: number;
}

export interface ActivityTotals {
  /** Device-time, not wall-clock attention. See the module comment. */
  activeSeconds: number;
  sessions: number;
  usersWithActivity: number;
  medianSessionSeconds: number;
  bySurface: SurfaceTotal[];
}

/**
 * Per-user totals over a window, keyed by user id.
 *
 * A session's length is the sum of its segments' `active_ms`, never
 * `max(ended_at) - min(started_at)`: a session survives a five-minute
 * background excursion, so the elapsed span would count time the learner spent
 * elsewhere. Ten minutes of study either side of a five-minute break is a
 * ten-minute session, not a fifteen-minute one.
 */
export async function getUserActivityTotals(
  userIds: string[],
  since: Date,
): Promise<Map<string, UserActivityTotals>> {
  const result = new Map<string, UserActivityTotals>();
  if (userIds.length === 0) return result;

  const rows = await db.execute(sql`
    WITH session_totals AS (
      SELECT user_id,
             session_id,
             sum(active_ms) AS session_active_ms
      FROM activity_segments
      WHERE user_id::text = ANY(${sqlTextArray(userIds)})
        AND started_at >= ${since.toISOString()}::timestamptz
      GROUP BY user_id, session_id
    )
    SELECT user_id::text AS user_id,
           (sum(session_active_ms) / 1000)::int AS active_seconds,
           count(*)::int AS sessions,
           (coalesce(
              percentile_cont(0.5) WITHIN GROUP (ORDER BY session_active_ms), 0
            ) / 1000)::int AS median_session_seconds
    FROM session_totals
    GROUP BY user_id
  `);

  for (const raw of rows as unknown as Record<string, unknown>[]) {
    const userId = String(raw.user_id ?? '');
    if (!userId) continue;
    result.set(userId, {
      userId,
      activeSeconds: numberFromRow(raw, 'active_seconds'),
      sessions: numberFromRow(raw, 'sessions'),
      medianSessionSeconds: numberFromRow(raw, 'median_session_seconds'),
    });
  }

  return result;
}

/**
 * App-wide totals plus the surface breakdown.
 *
 * Takes the same exclusions as every other panel on the dashboard. Without them
 * this one would count the team's own test accounts while the per-user table
 * directly beneath it does not, and the two would visibly disagree.
 */
export async function getActivityTotals(
  since: Date,
  exclusions: UserExclusions,
): Promise<ActivityTotals> {
  const sinceIso = since.toISOString();
  const included = includedUserCondition('u', exclusions);

  // Issued together: they are independent, and dispatching both before either
  // resolves keeps the pair's ordering deterministic as well as faster.
  const [sessionRows, surfaceRows] = await Promise.all([
    db.execute(sql`
    WITH session_totals AS (
      SELECT s.user_id, s.session_id, sum(s.active_ms) AS session_active_ms
      FROM activity_segments s
      JOIN users u ON u.id = s.user_id AND ${included}
      WHERE s.started_at >= ${sinceIso}::timestamptz
      GROUP BY s.user_id, s.session_id
    )
    SELECT (coalesce(sum(session_active_ms), 0) / 1000)::bigint AS active_seconds,
           count(*)::int AS sessions,
           count(DISTINCT user_id)::int AS users_with_activity,
           (coalesce(
              percentile_cont(0.5) WITHIN GROUP (ORDER BY session_active_ms), 0
            ) / 1000)::int AS median_session_seconds
    FROM session_totals
  `),
    db.execute(sql`
    SELECT s.surface AS surface,
           (coalesce(sum(s.active_ms), 0) / 1000)::bigint AS active_seconds,
           count(DISTINCT s.session_id)::int AS sessions
    FROM activity_segments s
    JOIN users u ON u.id = s.user_id AND ${included}
    WHERE s.started_at >= ${sinceIso}::timestamptz
    GROUP BY s.surface
    ORDER BY active_seconds DESC
  `),
  ]);

  const summary = (sessionRows as unknown as Record<string, unknown>[])[0] ?? {};

  return {
    activeSeconds: numberFromRow(summary, 'active_seconds'),
    sessions: numberFromRow(summary, 'sessions'),
    usersWithActivity: numberFromRow(summary, 'users_with_activity'),
    medianSessionSeconds: numberFromRow(summary, 'median_session_seconds'),
    bySurface: (surfaceRows as unknown as Record<string, unknown>[]).map((raw) => ({
      surface: String(raw.surface ?? 'other'),
      activeSeconds: numberFromRow(raw, 'active_seconds'),
      sessions: numberFromRow(raw, 'sessions'),
    })),
  };
}
