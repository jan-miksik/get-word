/**
 * Regional variants the app teaches as distinct languages.
 *
 * English is the only base split today. A learner studying for Czech school or
 * Cambridge/IELTS needs British spelling and a British voice; someone aiming at
 * the US wants the opposite. Before this split, voices were pooled by base
 * language, so one English list was read by a random mix of British, American,
 * Australian and Indian Chirp3-HD voices.
 *
 * `en` (no region) is the BRITISH entry, not a neutral one: it is the code
 * already stored on existing lists and British is the variant the product
 * recommends by default. `en-US` is the added American entry.
 *
 * The split is opt-in per base so nothing else changes meaning: `pt` still
 * pools Brazilian voices and `zh-CN` still resolves through Google's `cmn-*`
 * voice buckets, both of which locale-scoping would break.
 */

import { normalizeLanguageCode, type SupportedLanguage } from "@/lib/i18n/languages";

/** Bases whose voices and spelling are resolved per region rather than pooled. */
const REGIONAL_LEARNING_BASES: Record<string, { defaultLocale: string; locales: string[] }> = {
  en: { defaultLocale: "en-GB", locales: ["en-GB", "en-US"] },
};

/**
 * Learning-language entries for the regional variants.
 *
 * Deliberately NOT part of `COMMON_LANGUAGES`: that list also feeds the
 * interface-language picker and browser detection, where an `en-US` entry would
 * claim every US browser for a UI locale that has no message bundle.
 *
 * `displayCode` is what the picker localizes for the label, so `en` reads as
 * "British English" / "angličtina (Spojené království)" instead of a second,
 * indistinguishable "English" next to the American one.
 */
export const LEARNING_LANGUAGE_VARIANTS: SupportedLanguage[] = [
  { code: "en", name: "English (UK)", flag: "🇬🇧", displayCode: "en-GB", source: "common" },
  { code: "en-US", name: "English (US)", flag: "🇺🇸", displayCode: "en-US", source: "common" },
];

/**
 * The locale this language code actually speaks and spells, or null when the
 * base is not regionally split and callers should keep pooling by base.
 */
export function resolveLanguageVariantLocale(code: string): string | null {
  const normalized = normalizeLanguageCode(code);
  const [base, region] = normalized.split("-");
  const split = REGIONAL_LEARNING_BASES[base];
  if (!split) return null;
  if (!region) return split.defaultLocale;
  return split.locales.includes(normalized) ? normalized : split.defaultLocale;
}

/**
 * Short locale tag to show next to a language name — "EN-GB", "EN-US" — or null
 * when the language has no sibling variant to be told apart from.
 *
 * The stored code alone is not a label: bare `en` is British English, so a raw
 * code column reads "EN" next to "EN-US" and looks like "English" versus
 * "American English" rather than one choice between two regions.
 */
export function getLanguageVariantTag(code: string): string | null {
  const locale = resolveLanguageVariantLocale(code);
  return locale ? locale.toUpperCase() : null;
}

/**
 * Language code to send to an API that only knows base languages — Google
 * Translate v2 rejects `en-US`, while `zh-CN` and `pt-BR` are real targets for
 * it and must survive untouched.
 */
export function toBaseLanguageForTranslationApi(code: string): string {
  const normalized = normalizeLanguageCode(code);
  return resolveLanguageVariantLocale(normalized)
    ? normalized.split("-")[0]
    : normalized;
}

const VARIANT_PROMPT_DESCRIPTIONS: Record<string, string> = {
  "en-GB":
    "British English — British spelling and vocabulary (colour, realise, centre, lift, autumn, flat, mobile, rubbish) and British date conventions",
  "en-US":
    "American English — American spelling and vocabulary (color, realize, center, elevator, fall, apartment, cell phone, trash) and American date conventions",
};

/**
 * One-line description of the variant for an LLM prompt, or null when the
 * language has no variant to enforce.
 */
export function describeLanguageVariant(code: string): string | null {
  const locale = resolveLanguageVariantLocale(code);
  return locale ? (VARIANT_PROMPT_DESCRIPTIONS[locale] ?? null) : null;
}
