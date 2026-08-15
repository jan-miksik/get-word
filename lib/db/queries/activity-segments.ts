import { and, eq, gte, lt, sql } from "drizzle-orm";

import {
  DAILY_ACTIVE_CEILING_MS,
  normalizeActivitySegment,
  utcDayKey,
  type IncomingActivitySegment,
  type NormalizedSegment,
} from "@/packages/domain/activity/segment-rules";
import { db } from "../client";
import { activitySegments } from "../schema";

export type { IncomingActivitySegment } from "@/packages/domain/activity/segment-rules";

/**
 * Same shape as `lib/db/queries/review-events.ts`: accepts either the top-level
 * `db` or a transaction handle so callers can run inside an outer transaction.
 */
type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | TxHandle;

async function sumActiveMsForDay(
  userId: string,
  day: Date,
  executor: Executor,
): Promise<number> {
  const dayStart = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [row] = await executor
    .select({ total: sql<string>`coalesce(sum(${activitySegments.activeMs}), 0)` })
    .from(activitySegments)
    .where(
      and(
        eq(activitySegments.userId, userId),
        gte(activitySegments.startedAt, dayStart),
        lt(activitySegments.startedAt, dayEnd),
      ),
    );

  return Number(row?.total ?? 0);
}

/**
 * Idempotent insert keyed on (user_id, client_segment_id), mirroring
 * `recordReviewEventIfNew`. Returns the client ids newly stored; duplicates and
 * rejected rows are simply omitted.
 */
export async function recordActivitySegmentsIfNew(
  args: {
    userId: string;
    deviceId?: string | null;
    segments: IncomingActivitySegment[];
  },
  executor: Executor = db,
): Promise<string[]> {
  const now = Date.now();
  const normalized = args.segments
    .map((segment) => normalizeActivitySegment(segment, now))
    .filter((segment): segment is NormalizedSegment => segment !== null);

  if (normalized.length === 0) return [];

  // The ceiling is enforced per UTC day, so a batch spanning midnight is
  // budgeted against each day rather than charged wholly to one of them.
  const dayTotals = new Map<string, number>();
  const accepted: NormalizedSegment[] = [];

  for (const segment of normalized) {
    const dayKey = utcDayKey(segment.startedAt);
    let total = dayTotals.get(dayKey);
    if (total === undefined) {
      total = await sumActiveMsForDay(args.userId, segment.startedAt, executor);
    }
    if (total + segment.activeMs > DAILY_ACTIVE_CEILING_MS) {
      dayTotals.set(dayKey, total);
      continue;
    }
    dayTotals.set(dayKey, total + segment.activeMs);
    accepted.push(segment);
  }

  if (accepted.length === 0) return [];

  const inserted = await executor
    .insert(activitySegments)
    .values(
      accepted.map((segment) => ({
        userId: args.userId,
        clientSegmentId: segment.clientSegmentId,
        deviceId: args.deviceId?.trim() || null,
        sessionId: segment.sessionId,
        surface: segment.surface,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        activeMs: segment.activeMs,
        interactions: segment.interactions,
      })),
    )
    .onConflictDoNothing()
    .returning({ clientSegmentId: activitySegments.clientSegmentId });

  return inserted.map((row) => row.clientSegmentId);
}
