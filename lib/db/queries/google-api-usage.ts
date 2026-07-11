import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { googleApiUsage } from "../schema";

export type GoogleApiScope = "translate" | "tts";

export const GOOGLE_API_ACCOUNT_LIMIT_MESSAGE =
  "This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.";

const DEFAULT_FREE_MONTHLY_UNITS: Record<GoogleApiScope, number> = {
  translate: 500_000,
  tts: 1_000_000,
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseLimitRatio(): number {
  const parsed = Number(process.env.GOOGLE_API_FREE_ACCOUNT_LIMIT_RATIO);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.05;
  return Math.min(parsed, 1);
}

export function getCurrentGoogleApiPeriodStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function countGoogleApiTextUnits(texts: string[]): number {
  return texts.reduce((total, text) => total + Array.from(text).length, 0);
}

export function getGoogleApiFreeMonthlyUnits(scope: GoogleApiScope): number {
  const envName =
    scope === "translate"
      ? "GOOGLE_TRANSLATE_FREE_MONTHLY_CHARS"
      : "GOOGLE_TTS_FREE_MONTHLY_CHARS";
  return parsePositiveInt(process.env[envName], DEFAULT_FREE_MONTHLY_UNITS[scope]);
}

export function getGoogleApiAccountMonthlyLimit(scope: GoogleApiScope): number {
  const envName =
    scope === "translate"
      ? "GOOGLE_TRANSLATE_ACCOUNT_MONTHLY_CHARS"
      : "GOOGLE_TTS_ACCOUNT_MONTHLY_CHARS";
  const defaultLimit = Math.max(
    1,
    Math.floor(getGoogleApiFreeMonthlyUnits(scope) * parseLimitRatio()),
  );
  return parsePositiveInt(process.env[envName], defaultLimit);
}

export async function getGoogleApiUsageForUser(input: {
  userId: string;
  periodStart?: Date;
}) {
  const periodStart = input.periodStart ?? getCurrentGoogleApiPeriodStart();
  return db
    .select({
      scope: googleApiUsage.scope,
      units: googleApiUsage.units,
      requestCount: googleApiUsage.requestCount,
      periodStart: googleApiUsage.periodStart,
      updatedAt: googleApiUsage.updatedAt,
    })
    .from(googleApiUsage)
    .where(
      and(
        eq(googleApiUsage.userId, input.userId),
        eq(googleApiUsage.periodStart, periodStart),
      ),
    );
}

export async function getGoogleApiUsageAcrossAccounts(periodStart = getCurrentGoogleApiPeriodStart()) {
  return db
    .select({
      scope: googleApiUsage.scope,
      units: sql<number>`coalesce(sum(${googleApiUsage.units}), 0)::int`,
      requestCount: sql<number>`coalesce(sum(${googleApiUsage.requestCount}), 0)::int`,
      accountCount: sql<number>`count(distinct ${googleApiUsage.userId})::int`,
    })
    .from(googleApiUsage)
    .where(eq(googleApiUsage.periodStart, periodStart))
    .groupBy(googleApiUsage.scope);
}

async function getCurrentScopeUsage(input: {
  userId: string;
  scope: GoogleApiScope;
  periodStart: Date;
}): Promise<number> {
  const [row] = await db
    .select({ units: googleApiUsage.units })
    .from(googleApiUsage)
    .where(
      and(
        eq(googleApiUsage.userId, input.userId),
        eq(googleApiUsage.scope, input.scope),
        eq(googleApiUsage.periodStart, input.periodStart),
      ),
    )
    .limit(1);
  return row?.units ?? 0;
}

export async function reserveGoogleApiUsage(input: {
  userId: string;
  scope: GoogleApiScope;
  units: number;
  requestCount?: number;
  periodStart?: Date;
}): Promise<{
  allowed: boolean;
  scope: GoogleApiScope;
  periodStart: Date;
  requestedUnits: number;
  usedUnits: number;
  accountLimit: number;
  freeMonthlyUnits: number;
  message?: string;
}> {
  const requestedUnits = Math.max(0, Math.floor(input.units));
  const periodStart = input.periodStart ?? getCurrentGoogleApiPeriodStart();
  const accountLimit = getGoogleApiAccountMonthlyLimit(input.scope);
  const freeMonthlyUnits = getGoogleApiFreeMonthlyUnits(input.scope);

  if (requestedUnits === 0) {
    return {
      allowed: true,
      scope: input.scope,
      periodStart,
      requestedUnits,
      usedUnits: await getCurrentScopeUsage({
        userId: input.userId,
        scope: input.scope,
        periodStart,
      }),
      accountLimit,
      freeMonthlyUnits,
    };
  }

  if (requestedUnits > accountLimit) {
    return {
      allowed: false,
      scope: input.scope,
      periodStart,
      requestedUnits,
      usedUnits: await getCurrentScopeUsage({
        userId: input.userId,
        scope: input.scope,
        periodStart,
      }),
      accountLimit,
      freeMonthlyUnits,
      message: GOOGLE_API_ACCOUNT_LIMIT_MESSAGE,
    };
  }

  const requestCount = Math.max(1, Math.floor(input.requestCount ?? 1));
  const periodStartSql = periodStart.toISOString();
  const rows = await db.execute(
    sql`
      INSERT INTO google_api_usage (
        user_id,
        scope,
        period_start,
        units,
        request_count,
        created_at,
        updated_at
      )
      VALUES (
        ${input.userId},
        ${input.scope},
        ${periodStartSql}::timestamp,
        ${requestedUnits},
        ${requestCount},
        now(),
        now()
      )
      ON CONFLICT (user_id, scope, period_start)
      DO UPDATE SET
        units = google_api_usage.units + EXCLUDED.units,
        request_count = google_api_usage.request_count + EXCLUDED.request_count,
        updated_at = now()
      WHERE google_api_usage.units + EXCLUDED.units <= ${accountLimit}
      RETURNING units
    `,
  );

  const usedUnits = Number(rows[0]?.units ?? 0);
  if (rows.length === 0) {
    return {
      allowed: false,
      scope: input.scope,
      periodStart,
      requestedUnits,
      usedUnits: await getCurrentScopeUsage({
        userId: input.userId,
        scope: input.scope,
        periodStart,
      }),
      accountLimit,
      freeMonthlyUnits,
      message: GOOGLE_API_ACCOUNT_LIMIT_MESSAGE,
    };
  }

  return {
    allowed: true,
    scope: input.scope,
    periodStart,
    requestedUnits,
    usedUnits,
    accountLimit,
    freeMonthlyUnits,
  };
}

/**
 * Record usage that has already happened. Unlike `reserveGoogleApiUsage`, this does
 * not enforce the account cap: it is used to true up best-effort retry/fallback calls
 * after they have already been sent to Google, so the next reservation sees reality.
 */
export async function recordGoogleApiUsage(input: {
  userId: string;
  scope: GoogleApiScope;
  units: number;
  requestCount?: number;
  periodStart?: Date;
}): Promise<void> {
  const units = Math.max(0, Math.floor(input.units));
  const requestCount = Math.max(0, Math.floor(input.requestCount ?? 0));
  if (units === 0 && requestCount === 0) return;

  const periodStart = input.periodStart ?? getCurrentGoogleApiPeriodStart();
  const periodStartSql = periodStart.toISOString();
  await db.execute(
    sql`
      INSERT INTO google_api_usage (
        user_id,
        scope,
        period_start,
        units,
        request_count,
        created_at,
        updated_at
      )
      VALUES (
        ${input.userId},
        ${input.scope},
        ${periodStartSql}::timestamp,
        ${units},
        ${requestCount},
        now(),
        now()
      )
      ON CONFLICT (user_id, scope, period_start)
      DO UPDATE SET
        units = google_api_usage.units + EXCLUDED.units,
        request_count = google_api_usage.request_count + EXCLUDED.request_count,
        updated_at = now()
    `,
  );
}
