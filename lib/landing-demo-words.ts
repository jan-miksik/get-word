import { getBaseLanguage, normalizeLanguageCode } from "@/lib/i18n/languages";
import { LANDING_DEMO_AUDIO_LANGUAGE_CODES } from "@/lib/landing-demo-audio-languages";
import { LANDING_DEMO_WORD_DATA } from "@/lib/landing-demo-word-data";

/**
 * Fixed word set for the public landing-page demo card: "yes",
 * "I don't understand", "thank you" — three phrases a beginner reaches for
 * first. Shared between the client card (`components/LandingDemoCard.tsx`),
 * the public demo-audio endpoint (`app/api/audio/demo/route.ts`), which only
 * serves audio for texts on this whitelist, and the pre-generation script
 * (`scripts/generate-demo-audio.ts`).
 *
 * Word order must match across languages — index N in one language is the
 * translation of index N in every other.
 */

export type LandingDemoLexeme = {
  text: string;
};

export const LANDING_DEMO_WORDS: Record<string, LandingDemoLexeme[]> = LANDING_DEMO_WORD_DATA;

export const LANDING_DEMO_AUDIO_LANGUAGES = new Set<string>(LANDING_DEMO_AUDIO_LANGUAGE_CODES);

const LANDING_DEMO_AUDIO_BASE = "/audio/demo";

export type LandingDemoAudioEntry = {
  text: string;
  url: string;
};

/** Map any language code onto a demo-supported code, or null. */
export function resolveLandingDemoCode(code: string): string | null {
  const normalized = normalizeLanguageCode(code);
  if (LANDING_DEMO_WORDS[normalized]) return normalized;
  const base = getBaseLanguage(normalized);
  return LANDING_DEMO_WORDS[base] ? base : null;
}

export function getLandingDemoStaticAudioUrl(lang: string, wordIndex: number): string | null {
  const resolved = resolveLandingDemoCode(lang);
  if (
    !resolved ||
    !LANDING_DEMO_AUDIO_LANGUAGES.has(resolved) ||
    !LANDING_DEMO_WORDS[resolved]?.[wordIndex]
  ) {
    return null;
  }
  return `${LANDING_DEMO_AUDIO_BASE}/${encodeURIComponent(resolved)}/${wordIndex + 1}.mp3`;
}

export function getLandingDemoStaticAudioEntries(lang: string): LandingDemoAudioEntry[] {
  const resolved = resolveLandingDemoCode(lang);
  if (!resolved || !LANDING_DEMO_AUDIO_LANGUAGES.has(resolved)) return [];
  return LANDING_DEMO_WORDS[resolved].map((word, index) => ({
    text: word.text,
    url: `${LANDING_DEMO_AUDIO_BASE}/${encodeURIComponent(resolved)}/${index + 1}.mp3`,
  }));
}
