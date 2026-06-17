import { GoogleTTSQuotaExhaustedError } from "./audio";
import { GOOGLE_TTS_MAX_RPM } from "./audio-rate";

// Server-only pacing + retry around Google Cloud TTS, so a large batch stays
// under Google's per-minute request quota instead of bursting past it and
// failing the whole run. Google reports both the per-minute rate limit and the
// monthly cap as RESOURCE_EXHAUSTED, so we retry it with backoff; the app's own
// monthly reservation (reserveGoogleApiUsage) gates the truly-exhausted case
// before generation, which makes runtime RESOURCE_EXHAUSTED overwhelmingly the
// recoverable per-minute limit.

const MAX_RPM = Number(process.env.GOOGLE_TTS_MAX_RPM) || GOOGLE_TTS_MAX_RPM;
const SLOT_INTERVAL_MS = 60_000 / Math.max(1, MAX_RPM);
const MAX_RETRIES = Number(process.env.GOOGLE_TTS_MAX_RETRIES) || 4;
const BASE_BACKOFF_MS = 1_000;

// Module-level "next free slot" timestamp. Persists across requests in a warm
// runtime instance, so concurrent batches in the same instance are paced
// together rather than each bursting independently.
let nextSlotAt = 0;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserve the next evenly-spaced request slot, waiting until it is due.
 * Spacing requests by `SLOT_INTERVAL_MS` keeps throughput at or below MAX_RPM.
 */
export async function acquireGoogleTtsSlot(): Promise<void> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextSlotAt);
  nextSlotAt = scheduledAt + SLOT_INTERVAL_MS;
  const waitMs = scheduledAt - now;
  if (waitMs > 0) await delay(waitMs);
}

/**
 * Run a Google TTS call paced under the per-minute quota, retrying on
 * RESOURCE_EXHAUSTED with exponential backoff. Rethrows the original error
 * after the retry budget is spent (which lets the caller halt the batch).
 */
export async function runGoogleTtsWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    await acquireGoogleTtsSlot();
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof GoogleTTSQuotaExhaustedError;
      if (!retryable || attempt >= MAX_RETRIES) throw err;
      attempt += 1;
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * 250;
      await delay(backoff + jitter);
    }
  }
}
