/** First intentionally generated UI-localisation release. */
const UI_TRANSLATION_WAVE_1_LANGUAGE_CODES = [
  "de",
  "hi",
  "es",
  "fr",
  "pt",
] as const;

/** Prepared follow-up release; these stay hidden until their bundles exist. */
const UI_TRANSLATION_WAVE_2_LANGUAGE_CODES = [
  "zh-CN",
  "ar",
  "pl",
  "ja",
  "ko",
] as const;

export const UI_TRANSLATION_WAVES = {
  1: UI_TRANSLATION_WAVE_1_LANGUAGE_CODES,
  2: UI_TRANSLATION_WAVE_2_LANGUAGE_CODES,
} as const;

// The generator's no-argument default is deliberately only the next release.
export const TOP_PREGENERATED_UI_LANGUAGE_CODES = UI_TRANSLATION_WAVE_1_LANGUAGE_CODES;
