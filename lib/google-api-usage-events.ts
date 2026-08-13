export type GoogleApiUsageSource =
  | "audio_batch"
  | "audio_repair"
  | "common_list_autogenerate"
  | "landing_demo_audio_script"
  | "landing_demo_words_script"
  | "list_fork"
  | "photo_lab_audio"
  | "supported_languages"
  | "translation_batch"
  | "tts_voice_catalog"
  | "ui_locale_runtime"
  | "ui_locale_script"
  | "word_chat_audio";

export type GoogleApiUsageContext = {
  source: GoogleApiUsageSource;
  userId?: string | null;
};

export type GoogleApiUsageEvent = GoogleApiUsageContext & {
  scope: "translate" | "tts";
  model?: string | null;
  units: number;
  requestCount?: number;
};

let warnedAboutMissingDatabase = false;

/**
 * Best-effort append-only observation of a completed Google API call.
 *
 * Provider output must not be discarded merely because telemetry is temporarily
 * unavailable. Production has DATABASE_URL; standalone scripts without it keep
 * working and emit one warning instead of failing after Google has already billed.
 */
export async function recordGoogleApiUsageEvent(event: GoogleApiUsageEvent): Promise<void> {
  if (!process.env.DATABASE_URL) {
    if (!warnedAboutMissingDatabase) {
      warnedAboutMissingDatabase = true;
      console.warn("[Google API usage] DATABASE_URL is not configured; provider calls are not persisted.");
    }
    return;
  }

  try {
    const { appendGoogleApiUsageEvent } = await import("@/lib/db/queries/google-api-usage");
    await appendGoogleApiUsageEvent(event);
  } catch (error) {
    console.error("[Google API usage] failed to persist provider call", {
      scope: event.scope,
      source: event.source,
      units: event.units,
      requestCount: event.requestCount ?? 1,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
