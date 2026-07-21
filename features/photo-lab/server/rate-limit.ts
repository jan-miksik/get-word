import {
  getDailyBucketUsage,
  parsePositiveIntEnv,
  reserveDailyBuckets,
  type BucketPeriod,
} from "@/lib/rate-limit/daily-bucket";
import { getActiveSchoolEntitlement } from "@/features/schools/server/entitlements";
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

export async function reservePhotoLabRateLimit(
  userId: string,
  isEditor: boolean,
): Promise<void> {
  // Editors already have a larger daily allowance than any school plan grants,
  // so the school bucket applies only where it is an upgrade.
  const entitlement = isEditor ? null : await getActiveSchoolEntitlement(userId);
  if (entitlement) {
    await reserveDailyBuckets([
      {
        key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:school-user:${userId}`,
        period: "month",
        limit: entitlement.limits.photoLabMonthlyLimit,
        message: "Monthly school photo analysis limit reached for this account.",
      },
      {
        key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:global`,
        limit: parsePositiveIntEnv(
          process.env.OPENROUTER_PHOTO_LAB_GLOBAL_DAILY_LIMIT,
          DEFAULT_GLOBAL_DAILY_LIMIT,
        ),
        message: "Daily photo analysis limit reached. Please try again tomorrow.",
      },
    ]);
    return;
  }

  await reserveDailyBuckets([
    userAnalysisBucket(userId, isEditor),
    {
      key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:global`,
      limit: parsePositiveIntEnv(
        process.env.OPENROUTER_PHOTO_LAB_GLOBAL_DAILY_LIMIT,
        DEFAULT_GLOBAL_DAILY_LIMIT,
      ),
      message: "Daily photo analysis limit reached. Please try again tomorrow.",
    },
  ]);
}

export async function getPhotoLabUsage(userId: string, isEditor: boolean) {
  // Mirrors the bucket choice in reservePhotoLabRateLimit.
  const entitlement = isEditor ? null : await getActiveSchoolEntitlement(userId);
  if (entitlement) {
    const usage = await getDailyBucketUsage(
      `${PHOTO_LAB_RATE_BUCKET_PREFIX}:school-user:${userId}`,
      "month",
    );
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
