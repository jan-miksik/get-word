import {
  DailyLimitError,
  getDailyBucketUsage,
  parsePositiveIntEnv,
  reserveDailyBuckets,
  type BucketPeriod,
} from "@/lib/rate-limit/daily-bucket";
import { db } from "@/lib/db/client";
import {
  getActiveSchoolEntitlement,
  getCurrentSchoolFeaturePeriod,
  getSchoolFeatureUsage,
} from "@/features/schools/server/entitlements";
import {
  refundSchoolFeatureUsage,
  reserveSchoolFeatureUsage,
} from "@/features/schools/server/feature-usage";
import {
  DEFAULT_AUDIO_GLOBAL_DAILY_LIMIT,
  DEFAULT_AUDIO_USER_DAILY_LIMIT,
  DEFAULT_GLOBAL_DAILY_LIMIT,
  DEFAULT_USER_DAILY_LIMIT,
  DEFAULT_USER_MONTHLY_LIMIT,
  PHOTO_LAB_AUDIO_RATE_BUCKET_PREFIX,
  PHOTO_LAB_RATE_BUCKET_PREFIX,
} from "./config";

export { DailyLimitError } from "@/lib/rate-limit/daily-bucket";

/**
 * Reserve `clipCount` label-TTS generations. Called only for clips that are
 * actually missing from the media cache, so dedupe hits never consume budget.
 */
export async function reservePhotoLabAudioRateLimit(
  userId: string,
  clipCount: number,
): Promise<void> {
  await reserveDailyBuckets([
    {
      key: `${PHOTO_LAB_AUDIO_RATE_BUCKET_PREFIX}:user:${userId}`,
      limit: parsePositiveIntEnv(
        process.env.PHOTO_LAB_AUDIO_USER_DAILY_LIMIT,
        DEFAULT_AUDIO_USER_DAILY_LIMIT,
      ),
      count: clipCount,
      message: "Daily photo-lab audio limit reached for this account.",
    },
    {
      key: `${PHOTO_LAB_AUDIO_RATE_BUCKET_PREFIX}:global`,
      limit: parsePositiveIntEnv(
        process.env.PHOTO_LAB_AUDIO_GLOBAL_DAILY_LIMIT,
        DEFAULT_AUDIO_GLOBAL_DAILY_LIMIT,
      ),
      count: clipCount,
      message: "Daily photo-lab audio limit reached. Please try again tomorrow.",
    },
  ]);
}

/**
 * An operator-set per-account allowance (`users.photo_lab_limit_override`).
 * It replaces the limit on whichever path the account takes — school quota
 * included — so there is a single answer to "how many may this person run".
 * 0 is a meaningful value (photo analysis off), hence the `>= 0` check rather
 * than a truthiness test.
 */
function normalizeLimitOverride(limitOverride: number | null | undefined): number | null {
  if (typeof limitOverride !== "number" || !Number.isFinite(limitOverride)) return null;
  return limitOverride >= 0 ? Math.floor(limitOverride) : null;
}

/**
 * Editors keep a daily allowance; regular users get a small monthly one.
 * Separate bucket keys per period so a role change never mixes windows.
 */
function userAnalysisBucket(userId: string, isEditor: boolean, limitOverride: number | null) {
  if (isEditor) {
    return {
      key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:user:${userId}`,
      period: "day" as BucketPeriod,
      limit:
        limitOverride ??
        parsePositiveIntEnv(
          process.env.OPENROUTER_PHOTO_LAB_USER_DAILY_LIMIT,
          DEFAULT_USER_DAILY_LIMIT,
        ),
      message: "Daily photo analysis limit reached for this account.",
    };
  }
  // A distinct key from the former `:user-week:` bucket: switching the window
  // must start a fresh count rather than inherit a partly spent week.
  return {
    key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:user-month:${userId}`,
    period: "month" as BucketPeriod,
    limit:
      limitOverride ??
      parsePositiveIntEnv(
        process.env.OPENROUTER_PHOTO_LAB_USER_MONTHLY_LIMIT,
        DEFAULT_USER_MONTHLY_LIMIT,
      ),
    message: "Monthly photo analysis limit reached for this account.",
  };
}

/**
 * Ceiling on what an abuser can spend on the shared server key: free accounts
 * are cheap to create (a new device id is enough) and carry only a small monthly
 * allowance each. It is not a capacity limit for ordinary use, and school
 * members are exempt — they are identity-verified and metered monthly instead.
 */
function globalAnalysisBucket() {
  return {
    key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:global`,
    limit: parsePositiveIntEnv(
      process.env.OPENROUTER_PHOTO_LAB_GLOBAL_DAILY_LIMIT,
      DEFAULT_GLOBAL_DAILY_LIMIT,
    ),
    message: "Daily photo analysis limit reached. Please try again tomorrow.",
  };
}

/**
 * What a successful reservation consumed. Returned so a later failure can undo
 * exactly what was taken: whether the school meter was used at all, and which
 * month's row it landed in. Recomputing either at refund time is wrong — the
 * member may have left the school since, and a request that starts at 23:59 on
 * the last day of the month would otherwise refund the next month's row.
 */
export type PhotoLabReservation =
  | { source: "school"; userId: string; periodStart: Date }
  | { source: "default" };

export async function reservePhotoLabRateLimit(
  userId: string,
  isEditor: boolean,
  limitOverride?: number | null,
): Promise<PhotoLabReservation> {
  const override = normalizeLimitOverride(limitOverride);
  // Editors already have a larger daily allowance than any school plan grants,
  // so the school bucket applies only where it is an upgrade.
  const entitlement = isEditor ? null : await getActiveSchoolEntitlement(userId);
  if (entitlement) {
    // School members are governed solely by their monthly allowance in
    // school_feature_usage — that row carries school_id and is what the school
    // dashboard reports. The shared daily cap deliberately does NOT apply: a
    // whole class working through one lesson would otherwise exhaust it and
    // block the school (and everyone else) for the rest of the day.
    const { start: periodStart } = getCurrentSchoolFeaturePeriod();
    const reservation = await reserveSchoolFeatureUsage(db, {
      userId,
      schoolId: entitlement.schoolId,
      feature: "photo_lab",
      periodStart,
      count: 1,
      limit: override ?? entitlement.limits.photoLabMonthlyLimit,
    });
    if (!reservation.reserved) {
      throw new DailyLimitError(
        "Monthly school photo analysis limit reached for this account.",
      );
    }
    return { source: "school", userId, periodStart };
  }

  // The global bucket applies even to an overridden account: it is the ceiling
  // on what the shared server key can spend in a day, not a per-user allowance.
  await reserveDailyBuckets([
    userAnalysisBucket(userId, isEditor, override),
    globalAnalysisBucket(),
  ]);
  return { source: "default" };
}

/**
 * Give a reservation back. Called for every failure where we observed the
 * provider produce nothing usable; only an ambiguous transport failure keeps
 * the allowance spent, mirroring the `released` / `unknown` split in
 * features/schools/server/translation-requests.
 *
 * Only the school meter is refundable — the free path's daily buckets are a
 * coarse abuse ceiling, not an allowance owed back.
 */
export async function releasePhotoLabReservation(
  reservation: PhotoLabReservation,
): Promise<void> {
  if (reservation.source !== "school") return;
  await refundSchoolFeatureUsage(db, {
    userId: reservation.userId,
    feature: "photo_lab",
    periodStart: reservation.periodStart,
    count: 1,
  });
}

export async function getPhotoLabUsage(
  userId: string,
  isEditor: boolean,
  limitOverride?: number | null,
) {
  const override = normalizeLimitOverride(limitOverride);
  // Mirrors the bucket choice in reservePhotoLabRateLimit.
  const entitlement = isEditor ? null : await getActiveSchoolEntitlement(userId);
  if (entitlement) {
    const usage = await getSchoolFeatureUsage({ userId, feature: "photo_lab" });
    const limit = override ?? entitlement.limits.photoLabMonthlyLimit;
    return {
      used: usage.used,
      limit,
      remaining: Math.max(0, limit - usage.used),
      resetAt: usage.resetAt,
      period: "month" as BucketPeriod,
      source: "school" as const,
      schoolId: entitlement.schoolId,
    };
  }

  const bucket = userAnalysisBucket(userId, isEditor, override);
  const usage = await getDailyBucketUsage(bucket.key, bucket.period);
  return {
    used: usage.used,
    limit: bucket.limit,
    remaining: Math.max(0, bucket.limit - usage.used),
    resetAt: usage.resetAt,
    period: bucket.period,
    source: "default" as const,
  };
}
