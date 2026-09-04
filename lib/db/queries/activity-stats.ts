import { sql } from 'drizzle-orm';

import {
  GOAL_CREDITED_SURFACES,
  type ActivitySurface,
} from '@/packages/contracts/src/activity';
import { db } from '../client';
import {
  includedUserCondition,
  numberFromRow,
  sqlTextArray,
  type StatsUserFilter,
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

interface SurfaceTotal {
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

export interface LocalDayActivity {
  day: string;
  unionMs: number;
  deviceMs: number;
  creditedMs: number;
}

/**
 * Cross-device interval union split at each segment's creation timezone. The
 * stored local key is an audit/fast-path stamp; interval math must still split
 * a row that crosses a local midnight.
 */
export async function getLocalDayActivity(
  userId: string,
  timezone: string,
  fromDay: string,
  toDay: string,
): Promise<LocalDayActivity[]> {
  const rows = await db.execute(sql`
    WITH source AS (
      SELECT started_at, ended_at, active_ms,
             coalesce(
               (SELECT name FROM pg_timezone_names WHERE name = timezone_at_creation LIMIT 1),
               ${timezone}
             ) AS tz
      FROM activity_segments
      WHERE user_id = ${userId}::uuid
        AND ended_at > (${fromDay}::date - interval '1 day')::timestamp AT TIME ZONE ${timezone}
        AND started_at < (${toDay}::date + interval '1 day')::timestamp AT TIME ZONE ${timezone}
        AND surface = ANY(${sqlTextArray([...GOAL_CREDITED_SURFACES])})
    ), pieces AS (
      SELECT day_value::date AS day_key,
             greatest(s.started_at, day_value::timestamp AT TIME ZONE s.tz) AS piece_start,
             least(s.ended_at, (day_value::date + 1)::timestamp AT TIME ZONE s.tz) AS piece_end
      FROM source s
      CROSS JOIN LATERAL generate_series(
        (s.started_at AT TIME ZONE s.tz)::date,
        (s.ended_at AT TIME ZONE s.tz)::date,
        interval '1 day'
      ) day_value
    ), bounded AS (
      SELECT * FROM pieces
      WHERE day_key >= ${fromDay}::date AND day_key <= ${toDay}::date AND piece_end > piece_start
    ), tagged AS (
      SELECT *, max(piece_end) OVER (
        PARTITION BY day_key ORDER BY piece_start, piece_end
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS previous_end
      FROM bounded
    ), islands AS (
      SELECT *, sum(CASE WHEN previous_end IS NULL OR piece_start > previous_end THEN 1 ELSE 0 END)
        OVER (PARTITION BY day_key ORDER BY piece_start, piece_end) AS island_id
      FROM tagged
    ), merged AS (
      SELECT day_key, island_id, min(piece_start) AS island_start, max(piece_end) AS island_end
      FROM islands GROUP BY day_key, island_id
    ), union_by_day AS (
      SELECT day_key, sum(extract(epoch FROM (island_end - island_start)) * 1000)::bigint AS union_ms
      FROM merged GROUP BY day_key
    ), device_by_day AS (
      SELECT day_key, sum(extract(epoch FROM (piece_end - piece_start)) * 1000)::bigint AS device_ms
      FROM bounded GROUP BY day_key
    )
    SELECT d.day_key::text AS day, u.union_ms, d.device_ms
    FROM device_by_day d JOIN union_by_day u ON u.day_key = d.day_key
    ORDER BY d.day_key
  `);
  return (rows as unknown as Record<string, unknown>[]).map((row) => {
    const unionMs = numberFromRow(row, 'union_ms');
    const deviceMs = numberFromRow(row, 'device_ms');
    return { day: String(row.day), unionMs, deviceMs, creditedMs: Math.min(unionMs, deviceMs) };
  });
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
 * Takes the same account filter as every other panel on the dashboard. Without
 * it this one would count the team's own test accounts while the per-user table
 * directly beneath it does not, and the two would visibly disagree.
 */
export async function getActivityTotals(
  since: Date,
  userFilter: StatsUserFilter,
): Promise<ActivityTotals> {
  const sinceIso = since.toISOString();
  const included = includedUserCondition('u', userFilter);

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
