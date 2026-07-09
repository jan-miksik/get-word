/**
 * Client-safe audio constants (no node-only imports), so both server code and
 * client components can import them without pulling in `crypto`/`googleTTS`.
 */

/**
 * Canonical id stored on a media asset when audio was produced by Google's default
 * name-less voice (`ssmlGender: FEMALE`, no explicit voice name). Storing this
 * sentinel instead of null lets the editor render "default Google voice" while still
 * distinguishing it from a legacy null ("unknown, pre-migration").
 */
export const DEFAULT_GOOGLE_TTS_VOICE_ID = "google:default:female";
