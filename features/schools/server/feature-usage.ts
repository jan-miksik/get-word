import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import type { SchoolFeature } from '@/features/schools/types';

/**
 * Monthly school feature metering. `school_feature_usage` is the single source
 * of truth for per-member school allowances: the conditional UPDATE below both
 * reserves and enforces the limit in one atomic statement, so no separate
 * rate-limit bucket may hold the same number.
 *
 * The quota row is keyed by (user_id, feature, period_start) — the quota is per
 * user per month and a school transfer must not reset it. `school_id` therefore
 * records the school the row is currently billed to; a member who transfers
 * mid-month has the whole month attributed to their latest school.
 */

/** `db` or a transaction handle from `db.transaction`. */
type Executor = Pick<typeof db, 'execute'>;

export async function reserveSchoolFeatureUsage(
  executor: Executor,
  input: {
    userId: string;
    schoolId: string;
    feature: SchoolFeature;
    periodStart: Date;
    count: number;
    limit: number;
  },
): Promise<{ reserved: boolean; used: number }> {
  const periodStartSql = input.periodStart.toISOString();

  await executor.execute(sql`
    INSERT INTO school_feature_usage (
      user_id,
      school_id,
      feature,
      period_start,
      used,
      created_at,
      updated_at
    )
    VALUES (
      ${input.userId},
      ${input.schoolId},
      ${input.feature},
      ${periodStartSql}::timestamp,
      0,
      now(),
      now()
    )
    ON CONFLICT (user_id, feature, period_start) DO NOTHING
  `);

  const rows = await executor.execute(sql`
    UPDATE school_feature_usage
    SET used = used + ${input.count},
        school_id = ${input.schoolId},
        updated_at = now()
    WHERE user_id = ${input.userId}
      AND feature = ${input.feature}
      AND period_start = ${periodStartSql}::timestamp
      AND used + ${input.count} <= ${input.limit}
    RETURNING used
  `);

  const row = rows[0] as { used?: unknown } | undefined;
  if (!row) return { reserved: false, used: 0 };
  const used = Number(row.used ?? 0);
  return { reserved: true, used: Number.isFinite(used) ? used : 0 };
}

/** Give a reservation back. Only for failures *before* the provider was charged. */
export async function refundSchoolFeatureUsage(
  executor: Executor,
  input: {
    userId: string;
    feature: SchoolFeature;
    periodStart: Date;
    count: number;
  },
): Promise<void> {
  await executor.execute(sql`
    UPDATE school_feature_usage
    SET used = greatest(0, used - ${input.count}),
        updated_at = now()
    WHERE user_id = ${input.userId}
      AND feature = ${input.feature}
      AND period_start = ${input.periodStart.toISOString()}::timestamp
  `);
}
