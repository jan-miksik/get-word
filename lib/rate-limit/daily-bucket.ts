import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthRateLimits } from "@/lib/db/schema";

export type DailyBucket = {
  key: string;
  limit: number;
  message: string;
  /** Units to reserve in one call (default 1). */
  count?: number;
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

/**
 * Atomically reserve one request against every bucket for the current UTC day.
 * All increments run in a single transaction, so an exhausted later bucket
 * (e.g. the global one) rolls back the earlier increments — a rejected request
 * never consumes part of a caller's daily allowance.
 */
export async function reserveDailyBuckets(buckets: DailyBucket[]): Promise<void> {
  const bucketStartSql = getUtcDayStart().toISOString();

  await db.transaction(async (tx) => {
    for (const bucket of buckets) {
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
  });
}

export function parsePositiveIntEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
