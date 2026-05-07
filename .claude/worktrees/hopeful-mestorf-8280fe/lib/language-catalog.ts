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
  preferredVoice: string | null;
};

type GoogleVoice = {
  name?: string;
  languageCodes?: string[];
  ssmlGender?: string;
  naturalSampleRateHertz?: number;
};

let ttsVoiceCache: { expiresAt: number; voices: GoogleVoice[] } | null = null;

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

function getBaseLanguage(code: string): string {
  return normalizeLanguageCode(code).split("-")[0];
}

async function fetchGoogleTtsVoices(): Promise<GoogleVoice[]> {
  const now = Date.now();
  if (ttsVoiceCache && ttsVoiceCache.expiresAt > now) return ttsVoiceCache.voices;

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) return [];

  const url = new URL("https://texttospeech.googleapis.com/v1/voices");
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  ttsVoiceCache = { expiresAt: now + 24 * 60 * 60 * 1000, voices };
  return voices;
}

function scoreVoice(voice: GoogleVoice): number {
  const name = voice.name ?? "";
  if (name.includes("Neural2")) return 0;
  if (name.includes("WaveNet")) return 1;
  if (name.includes("Studio")) return 2;
  if (name.includes("Standard")) return 4;
  return 3;
}

export async function getLearningLanguageCatalog(target = "en"): Promise<LearningLanguage[]> {
  const [translateLanguages, ttsVoices] = await Promise.all([
    fetchGoogleSupportedLanguages(target).catch(() => mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES)),
    fetchGoogleTtsVoices().catch(() => []),
  ]);

  const voicesByBase = new Map<string, GoogleVoice[]>();
  for (const voice of ttsVoices) {
    for (const code of voice.languageCodes ?? []) {
      const base = getBaseLanguage(code);
      const existing = voicesByBase.get(base) ?? [];
      existing.push(voice);
      voicesByBase.set(base, existing);
    }
  }

  return mergeLanguages(COMMON_LANGUAGES, translateLanguages).map((language) => {
    const base = getBaseLanguage(language.code);
    const voices = (voicesByBase.get(base) ?? [])
      .sort((a, b) => scoreVoice(a) - scoreVoice(b) || String(a.name).localeCompare(String(b.name)));
    const voiceNames = Array.from(new Set(voices.map((voice) => voice.name).filter((name): name is string => Boolean(name))));
    const fallbackTtsAvailable = ttsVoices.length === 0 && COMMON_TTS_LANGUAGE_BASES.has(base);

    return {
      ...language,
      ttsAvailable: voiceNames.length > 0 || fallbackTtsAvailable,
      ttsVoices: voiceNames,
      preferredVoice: voiceNames[0] ?? null,
    };
  });
}
