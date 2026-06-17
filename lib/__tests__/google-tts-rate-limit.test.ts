import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The pacer keeps process-level state and reads its retry budget at module-load
// time, so we re-import a fresh module graph each test. The exhaustion error
// class must come from that same fresh graph or the module's `instanceof` check
// would compare against a different class identity.
async function freshModule() {
  vi.resetModules();
  const audio = await import("@/lib/audio");
  const rateLimit = await import("@/lib/google-tts-rate-limit");
  return {
    runGoogleTtsWithRetry: rateLimit.runGoogleTtsWithRetry,
    GoogleTTSQuotaExhaustedError: audio.GoogleTTSQuotaExhaustedError,
  };
}

describe("runGoogleTtsWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns the first successful result without retrying", async () => {
    const { runGoogleTtsWithRetry } = await freshModule();
    const fn = vi.fn(async () => "ok");

    const promise = runGoogleTtsWithRetry(fn);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on RESOURCE_EXHAUSTED then succeeds", async () => {
    const { runGoogleTtsWithRetry, GoogleTTSQuotaExhaustedError } = await freshModule();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new GoogleTTSQuotaExhaustedError("rate limited"))
      .mockResolvedValueOnce("ok");

    const promise = runGoogleTtsWithRetry(fn);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and rethrows the exhaustion error", async () => {
    vi.stubEnv("GOOGLE_TTS_MAX_RETRIES", "2");
    const { runGoogleTtsWithRetry, GoogleTTSQuotaExhaustedError } = await freshModule();
    const fn = vi
      .fn()
      .mockRejectedValue(new GoogleTTSQuotaExhaustedError("still exhausted"));

    const promise = runGoogleTtsWithRetry(fn);
    const assertion = expect(promise).rejects.toBeInstanceOf(
      GoogleTTSQuotaExhaustedError,
    );
    await vi.runAllTimersAsync();
    await assertion;

    // initial attempt + 2 retries
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-rate-limit errors", async () => {
    const { runGoogleTtsWithRetry } = await freshModule();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    const promise = runGoogleTtsWithRetry(fn);
    const assertion = expect(promise).rejects.toThrow("boom");
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
