import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { Executor } from "@/lib/db/queries/executor";
import { oauthRateLimits } from "@/lib/db/schema";

export type BucketPeriod = "day" | "week" | "month";

export type DailyBucket = {
  key: string;
  limit: number;
  message: string;
  /** Units to reserve in one call (default 1). */
  count?: number;
/** Window the limit applies to (default "day"). Weeks start Monday UTC; months are calendar months UTC. */
  period?: BucketPeriod;
};

export class DailyLimitError extends Error {
  readonly code = "DAILY_LIMIT_REACHED";

  constructor(message: string) {
    super(message);
    this.name = "DailyLimitError";
  }
}

function getUtcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getUtcWeekStart(date = new Date()) {
  const dayStart = getUtcDayStart(date);
  const daysSinceMonday = (dayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}

function getBucketWindow(period: BucketPeriod, date = new Date()) {
  if (period === "month") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    return {
      start,
      resetAt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
    };
  }
  const start = period === "week" ? getUtcWeekStart(date) : getUtcDayStart(date);
  const days = period === "week" ? 7 : 1;
  return { start, resetAt: new Date(start.getTime() + days * 24 * 60 * 60 * 1000) };
}

export async function getDailyBucketUsage(
  key: string,
  period: BucketPeriod = "day",
  date = new Date(),
) {
  const { start: bucketStart, resetAt } = getBucketWindow(period, date);
  const rows = await db.execute(
    sql`
      SELECT request_count
      FROM ${oauthRateLimits}
      WHERE bucket_key = ${key}
        AND bucket_start = ${bucketStart.toISOString()}::timestamp
      LIMIT 1
    `,
  );
  const used = Number(rows[0]?.request_count ?? 0);
  return {
    used: Number.isFinite(used) ? used : 0,
    resetAt,
  };
}

/**
 * Atomically reserve one request against every bucket for its current UTC
 * window (day or week). All increments run in a single transaction, so an
 * exhausted later bucket (e.g. the global one) rolls back the earlier
 * increments — a rejected request never consumes part of a caller's allowance.
 *
 * Pass `executor` to join a transaction the caller already opened. That is what
 * lets a quota be reserved in the SAME transaction as the work it pays for, so
 * a crash cannot leave a charged quota with nothing saved (see the word-chat
 * commit). Without it, the reservation would run on its own connection and the
 * two would not roll back together.
 */
export async function reserveDailyBuckets(
  buckets: DailyBucket[],
  executor?: Executor,
): Promise<void> {
  const now = new Date();

  const run = async (tx: Executor) => {
    for (const bucket of buckets) {
      const bucketStartSql = getBucketWindow(bucket.period ?? "day", now).start.toISOString();
      const count = Math.max(1, Math.floor(bucket.count ?? 1));
      if (count > bucket.limit) {
        throw new DailyLimitError(bucket.message);
      }
      const rows = await tx.execute(
        sql`
          INSERT INTO ${oauthRateLimits} (
            bucket_key,
            bucket_start,
            request_count,
            created_at,
            updated_at
          )
          VALUES (${bucket.key}, ${bucketStartSql}::timestamp, ${count}, now(), now())
          ON CONFLICT (bucket_key, bucket_start)
          DO UPDATE SET
            request_count = ${oauthRateLimits.requestCount} + ${count},
            updated_at = now()
          WHERE ${oauthRateLimits.requestCount} + ${count} <= ${bucket.limit}
          RETURNING request_count
        `,
      );
      if (rows.length === 0) {
        throw new DailyLimitError(bucket.message);
      }
    }
  };

  if (executor) {
    await run(executor);
    return;
  }
  await db.transaction(run);
}

export function parsePositiveIntEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
