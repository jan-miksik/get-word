import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  mergeLanguages,
  normalizeLanguageCode,
  type SupportedLanguage,
} from "@/lib/i18n/languages";
import { fetchGoogleSupportedLanguages } from "@/lib/i18n/server";

export type LearningLanguage = SupportedLanguage & {
  ttsAvailable: boolean;
  ttsVoices: string[];
  /** Voice name → SSML gender ("MALE" | "FEMALE" | "NEUTRAL") when Google reports it. */
  ttsVoiceGenders: Record<string, string>;
  preferredVoice: string | null;
};

type GoogleVoice = {
  name?: string;
  languageCodes?: string[];
  ssmlGender?: string;
  naturalSampleRateHertz?: number;
};

let ttsVoiceCache: { expiresAt: number; voices: GoogleVoice[] } | null = null;

const EXCLUDED_LEARNING_LANGUAGE_CODES = new Set([
  "pt-PT",
  // Google's language list returns both bare "zh" and "zh-CN" for the same
  // language (Simplified Mandarin). Hide the bare "zh" duplicate and keep the
  // explicit "zh-CN", which is region-tagged and binds to Mandarin TTS.
  "zh",
]);

/**
 * Google Cloud TTS reports Mandarin voices under "cmn-*" language codes
 * (cmn-CN, cmn-TW), while Google Translate — and this catalog — identify
 * Chinese as "zh" (zh-CN, zh-TW). Without this alias the "cmn" voice bucket
 * never matches the "zh" lookup, so Chinese looks audio-less even though
 * Google fully supports it. Cantonese keeps its own "yue" base, which already
 * matches Translate's "yue".
 */
const TTS_BASE_ALIASES: Record<string, string> = {
  cmn: "zh",
};

const LANGUAGE_SPEAKER_ESTIMATES: Record<string, number> = {
  en: 1_500_000_000,
  zh: 1_180_000_000,
  hi: 609_000_000,
  es: 560_000_000,
  ar: 380_000_000,
  fr: 321_000_000,
  bn: 284_000_000,
  pt: 264_000_000,
  ru: 255_000_000,
  ur: 231_000_000,
  id: 200_000_000,
  de: 135_000_000,
  ja: 123_000_000,
  sw: 120_000_000,
  pa: 113_000_000,
  mr: 100_000_000,
  te: 96_000_000,
  tr: 90_000_000,
  ta: 87_000_000,
  ko: 82_000_000,
  vi: 78_000_000,
  it: 68_000_000,
  fa: 62_000_000,
  gu: 61_000_000,
  pl: 45_000_000,
  uk: 40_000_000,
  ml: 38_000_000,
  nl: 30_000_000,
  th: 29_000_000,
  ro: 24_000_000,
  cs: 13_000_000,
  sv: 13_000_000,
  el: 13_000_000,
  hu: 13_000_000,
  ca: 10_000_000,
  he: 9_000_000,
  sr: 9_000_000,
  bg: 8_000_000,
  sq: 7_500_000,
  sk: 7_000_000,
  da: 6_000_000,
  fi: 5_500_000,
  hr: 5_500_000,
  no: 5_000_000,
  lt: 3_000_000,
  sl: 2_500_000,
  mk: 2_500_000,
  gl: 2_400_000,
  lv: 2_000_000,
  ga: 1_800_000,
  et: 1_100_000,
  cy: 900_000,
  eu: 800_000,
  mt: 520_000,
  is: 400_000,
};

const COMMON_TTS_LANGUAGE_BASES = new Set([
  "ar",
  "cs",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "uk",
  "vi",
  "zh",
]);

/**
 * Default app-specific order.
 *
 * This should not be only "most spoken languages globally".
 * Czech/Vietnamese remain visible because they are historical/default featured languages,
 * but the product supports configurable Google-backed language pairs.
 */
const FEATURED_LANGUAGE_BASE_RANKS = new Map<string, number>([
  ["cs", 0],
  ["vi", 1],
  ["en", 2],
  ["de", 3],
  ["es", 4],
  ["fr", 5],
  ["uk", 6],
  ["ru", 7],
  ["pl", 8],
  ["it", 9],
  ["pt", 10],
  ["zh", 11],
  ["ja", 12],
  ["ko", 13],
  ["ar", 14],
]);

function getBaseLanguage(code: string): string {
  return normalizeLanguageCode(code).split("-")[0];
}

function getFeaturedRank(code: string): number {
  return FEATURED_LANGUAGE_BASE_RANKS.get(getBaseLanguage(code)) ?? Number.POSITIVE_INFINITY;
}

async function fetchGoogleTtsVoices(): Promise<GoogleVoice[]> {
  const now = Date.now();

  if (ttsVoiceCache && ttsVoiceCache.expiresAt > now) {
    return ttsVoiceCache.voices;
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) return [];

  const url = new URL("https://texttospeech.googleapis.com/v1/voices");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];

  ttsVoiceCache = {
    expiresAt: now + 24 * 60 * 60 * 1000,
    voices,
  };

  return voices;
}

function scoreVoice(voice: GoogleVoice): number {
  const name = voice.name ?? "";
  const normalizedName = name.toLowerCase();

  if (normalizedName.includes("chirp3-hd")) return 0;
  if (normalizedName.includes("chirp3")) return 1;
  if (normalizedName.includes("neural2")) return 2;
  if (normalizedName.includes("wavenet")) return 3;
  if (normalizedName.includes("studio")) return 4;
  if (normalizedName.includes("standard")) return 6;

  return 5;
}

function getSpeakerEstimate(code: string): number {
  return LANGUAGE_SPEAKER_ESTIMATES[getBaseLanguage(code)] ?? 0;
}

/**
 * Resolve concrete Google voice names to fall back to when a generated clip looks
 * broken. Returns the best Studio voice and the best Standard voice for the
 * language's base (or null when Google offers none — e.g. Vietnamese/Czech have no
 * Studio voice, so the autofix chain skips straight to Standard/default).
 *
 * Reuses the shared voice cache + `scoreVoice`; result is per-base and cheap.
 */
export async function getGoogleFallbackVoices(
  languageCode: string,
): Promise<{ studio: string | null; standard: string | null }> {
  const voices = await fetchGoogleTtsVoices().catch(() => []);
  const base = getBaseLanguage(languageCode);

  const forBase = voices.filter((voice) =>
    (voice.languageCodes ?? []).some((code) => {
      const rawBase = getBaseLanguage(code);
      return (TTS_BASE_ALIASES[rawBase] ?? rawBase) === base;
    }),
  );

  const pick = (marker: string): string | null => {
    const matches = forBase
      .filter((voice) => (voice.name ?? "").toLowerCase().includes(marker))
      .sort(
        (a, b) => scoreVoice(a) - scoreVoice(b) || String(a.name).localeCompare(String(b.name)),
      );
    return matches[0]?.name ?? null;
  };

  return { studio: pick("studio"), standard: pick("standard") };
}

/**
 * All Chirp3-HD voice names for a language's base, stably sorted. Photo-lab
 * mixes these per word; empty when the language has none (caller falls back to
 * the default voice). Reuses the shared 24h voice cache.
 */
export async function getGoogleChirp3HdVoices(languageCode: string): Promise<string[]> {
  const voices = await fetchGoogleTtsVoices().catch(() => []);
  const base = getBaseLanguage(languageCode);

  const names = voices
    .filter(
      (voice) =>
        (voice.name ?? "").toLowerCase().includes("chirp3-hd") &&
        (voice.languageCodes ?? []).some((code) => {
          const rawBase = getBaseLanguage(code);
          return (TTS_BASE_ALIASES[rawBase] ?? rawBase) === base;
        }),
    )
    .map((voice) => voice.name)
    .filter((name): name is string => Boolean(name));

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function compareLearningLanguages(left: LearningLanguage, right: LearningLanguage): number {
  const leftFeaturedRank = getFeaturedRank(left.code);
  const rightFeaturedRank = getFeaturedRank(right.code);

  if (leftFeaturedRank !== rightFeaturedRank) {
    return leftFeaturedRank - rightFeaturedRank;
  }

  if (left.ttsAvailable !== right.ttsAvailable) {
    return left.ttsAvailable ? -1 : 1;
  }

  const leftSpeakerEstimate = getSpeakerEstimate(left.code);
  const rightSpeakerEstimate = getSpeakerEstimate(right.code);

  if (leftSpeakerEstimate !== rightSpeakerEstimate) {
    return rightSpeakerEstimate - leftSpeakerEstimate;
  }

  return left.name.localeCompare(right.name);
}

export async function getLearningLanguageCatalog(target = "en"): Promise<LearningLanguage[]> {
  const [translateLanguages, ttsVoices] = await Promise.all([
    fetchGoogleSupportedLanguages(target).catch(() =>
      mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES),
    ),
    fetchGoogleTtsVoices().catch(() => []),
  ]);

  const voicesByBase = new Map<string, GoogleVoice[]>();

  for (const voice of ttsVoices) {
    for (const code of voice.languageCodes ?? []) {
      const rawBase = getBaseLanguage(code);
      const base = TTS_BASE_ALIASES[rawBase] ?? rawBase;
      const existing = voicesByBase.get(base) ?? [];

      existing.push(voice);
      voicesByBase.set(base, existing);
    }
  }

  return mergeLanguages(COMMON_LANGUAGES, translateLanguages)
    .filter((language) => {
      const normalizedCode = normalizeLanguageCode(language.code);
      return !EXCLUDED_LEARNING_LANGUAGE_CODES.has(normalizedCode);
    })
    .map((language): LearningLanguage => {
      const base = getBaseLanguage(language.code);

      const voices = (voicesByBase.get(base) ?? []).sort(
        (a, b) =>
          scoreVoice(a) - scoreVoice(b) ||
          String(a.name).localeCompare(String(b.name)),
      );

      const voiceNames = Array.from(
        new Set(
          voices
            .map((voice) => voice.name)
            .filter((name): name is string => Boolean(name)),
        ),
      );

      const ttsVoiceGenders: Record<string, string> = {};
      for (const voice of voices) {
        if (voice.name && voice.ssmlGender) {
          ttsVoiceGenders[voice.name] = voice.ssmlGender;
        }
      }

      const fallbackTtsAvailable =
        ttsVoices.length === 0 && COMMON_TTS_LANGUAGE_BASES.has(base);

      return {
        ...language,
        ttsAvailable: voiceNames.length > 0 || fallbackTtsAvailable,
        ttsVoices: voiceNames,
        ttsVoiceGenders,
        preferredVoice: voiceNames[0] ?? null,
      };
    })
    .sort(compareLearningLanguages);
}
