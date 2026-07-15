import {
  parsePositiveIntEnv,
  reserveDailyBuckets,
} from "@/lib/rate-limit/daily-bucket";
import {
  DEFAULT_GLOBAL_DAILY_LIMIT,
  DEFAULT_USER_DAILY_LIMIT,
  PHOTO_LAB_RATE_BUCKET_PREFIX,
} from "./config";

export { DailyLimitError } from "@/lib/rate-limit/daily-bucket";

export async function reservePhotoLabRateLimit(userId: string): Promise<void> {
  await reserveDailyBuckets([
    {
      key: `${PHOTO_LAB_RATE_BUCKET_PREFIX}:user:${userId}`,
      limit: parsePositiveIntEnv(
        process.env.OPENROUTER_PHOTO_LAB_USER_DAILY_LIMIT,
        DEFAULT_USER_DAILY_LIMIT,
      ),
      message: "Daily photo analysis limit reached for this account.",
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
}
