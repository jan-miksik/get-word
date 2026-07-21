// Default to the advanced pro-tier vision model — label quality (and Gemini's
// point-in-image grounding) matters more here than per-request cost.
export const PHOTO_LAB_MODEL =
  process.env.OPENROUTER_PHOTO_LAB_MODEL || "google/gemini-3.1-pro-preview";

// ~2 MB of binary image once base64 overhead (4/3) is accounted for. The client
// downscales to ≤1280px JPEG before upload, so hitting this means the client
// pipeline failed.
export const MAX_IMAGE_BASE64_CHARS = 2_800_000;

export const MAX_LABELS = 25;
export const PHOTO_LAB_MAX_TOKENS = 4000;

export const PHOTO_LAB_RATE_BUCKET_PREFIX = "photo_lab_analyze";
// Editors keep a daily allowance; regular users get a small weekly one.
export const DEFAULT_USER_DAILY_LIMIT = 10;
export const DEFAULT_USER_WEEKLY_LIMIT = 5;
// Abuse ceiling for the free path only — school members are exempt (see
// reservePhotoLabRateLimit). At roughly $0.015 per analysis this caps a runaway
// day at about $15 on the shared server key.
export const DEFAULT_GLOBAL_DAILY_LIMIT = 1000;

// Label TTS: counted per generated clip (cache hits are free), so the budget
// covers a full day of analyses (user limit × MAX_LABELS) plus retries.
export const PHOTO_LAB_AUDIO_RATE_BUCKET_PREFIX = "photo_lab_audio";
export const DEFAULT_AUDIO_USER_DAILY_LIMIT = 300;
export const DEFAULT_AUDIO_GLOBAL_DAILY_LIMIT = 3000;
export const MAX_AUDIO_TEXT_CHARS = 120;
export const MAX_AUDIO_TOTAL_CHARS = 2000;
