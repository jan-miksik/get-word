/**
 * Conservative ceiling under Google Cloud TTS's per-minute request quota
 * (~200 requests/minute on the accounts we run against). Shared by the
 * server-side pacer (`lib/google-tts-rate-limit.ts`) and the client-side
 * time estimates so the ETA we show matches the rate we actually generate at.
 *
 * The server may override the *pacing* with the `GOOGLE_TTS_MAX_RPM` env var;
 * this constant is the default and the basis for user-facing estimates.
 */
export const GOOGLE_TTS_MAX_RPM = 180;
