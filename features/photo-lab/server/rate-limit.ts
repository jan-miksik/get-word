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
  DEFAULT_USER_WEEKLY_LIMIT,
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
 * Editors keep a daily allowance; regular users get a small weekly one.
 * Separate bucket keys per period so a role change never mixes windows.
 */
function userAnalysisBucket(userId: string, isEditor: boolean) {
  if (isEditor) {
    return {
      key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:user:${userId}`,
      period: "day" as BucketPeriod,
      limit: parsePositiveIntEnv(
        process.env.OPENROUTER_PHOTO_LAB_USER_DAILY_LIMIT,
        DEFAULT_USER_DAILY_LIMIT,
      ),
      message: "Daily photo analysis limit reached for this account.",
    };
  }
  return {
    key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:user-week:${userId}`,
    period: "week" as BucketPeriod,
    limit: parsePositiveIntEnv(
      process.env.OPENROUTER_PHOTO_LAB_USER_WEEKLY_LIMIT,
      DEFAULT_USER_WEEKLY_LIMIT,
    ),
    message: "Weekly photo analysis limit reached for this account.",
  };
}

/**
 * Ceiling on what an abuser can spend on the shared server key: free accounts
 * are cheap to create (a new device id is enough) and carry only a small weekly
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
): Promise<PhotoLabReservation> {
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
      limit: entitlement.limits.photoLabMonthlyLimit,
    });
    if (!reservation.reserved) {
      throw new DailyLimitError(
        "Monthly school photo analysis limit reached for this account.",
      );
    }
    return { source: "school", userId, periodStart };
  }

  await reserveDailyBuckets([userAnalysisBucket(userId, isEditor), globalAnalysisBucket()]);
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

export async function getPhotoLabUsage(userId: string, isEditor: boolean) {
  // Mirrors the bucket choice in reservePhotoLabRateLimit.
  const entitlement = isEditor ? null : await getActiveSchoolEntitlement(userId);
  if (entitlement) {
    const usage = await getSchoolFeatureUsage({ userId, feature: "photo_lab" });
    return {
      used: usage.used,
      limit: entitlement.limits.photoLabMonthlyLimit,
      remaining: Math.max(0, entitlement.limits.photoLabMonthlyLimit - usage.used),
      resetAt: usage.resetAt,
      period: "month" as BucketPeriod,
      source: "school" as const,
      schoolId: entitlement.schoolId,
    };
  }

  const bucket = userAnalysisBucket(userId, isEditor);
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
