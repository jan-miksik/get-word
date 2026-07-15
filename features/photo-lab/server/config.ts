export const PHOTO_LAB_MODEL =
  process.env.OPENROUTER_PHOTO_LAB_MODEL || "google/gemini-2.5-pro";

// ~2 MB of binary image once base64 overhead (4/3) is accounted for. The client
// downscales to ≤1280px JPEG before upload, so hitting this means the client
// pipeline failed.
export const MAX_IMAGE_BASE64_CHARS = 2_800_000;

export const MAX_LABELS = 25;
export const PHOTO_LAB_MAX_TOKENS = 4000;

export const PHOTO_LAB_RATE_BUCKET_PREFIX = "photo_lab_analyze";
export const DEFAULT_USER_DAILY_LIMIT = 10;
export const DEFAULT_GLOBAL_DAILY_LIMIT = 100;
