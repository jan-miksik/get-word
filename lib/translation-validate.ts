/**
 * Deterministic, no-cost sanity checks on produced translations.
 *
 * The one signal precise enough to act on automatically is "the target language
 * uses a non-Latin script, but the output is Latin-only" — i.e. the model
 * returned romanization or the source language instead of a real translation.
 * Equality between source and target is deliberately NOT used: many words are
 * legitimately identical across languages (hotel, taxi, pizza), so it produces
 * false positives.
 */

import { normalizeLanguageCode } from "@/lib/i18n/languages";

// Base language codes whose primary writing system is not the Latin alphabet.
// Anything not listed is treated as Latin-ish and never flagged (no false
// positives for unknown or Latin-script languages).
const NON_LATIN_SCRIPT_LANGUAGES = new Set([
  "ko", // Hangul
  "ja", // Kana / Kanji
  "zh", // Han
  "ru", "uk", "be", "bg", "sr", "mk", "kk", "ky", "mn", "tg", // Cyrillic
  "el", // Greek
  "ar", "fa", "ur", "ps", "sd", // Arabic
  "he", "yi", // Hebrew
  "hi", "mr", "ne", "sa", // Devanagari
  "bn", "as", // Bengali
  "ta", "te", "kn", "ml", "gu", "pa", "or", "si", // other Brahmic
  "th", "lo", "km", "my", // SE Asian
  "ka", // Georgian
  "hy", // Armenian
  "am", "ti", // Ethiopic
]);

function baseLanguage(code: string): string {
  return normalizeLanguageCode(code).split("-")[0].toLowerCase();
}

export function expectsNonLatinScript(languageCode: string): boolean {
  return NON_LATIN_SCRIPT_LANGUAGES.has(baseLanguage(languageCode));
}

/** True when every letter in `text` is Latin (ignoring digits, punctuation, spaces). */
function isLatinOnly(text: string): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return false; // nothing to judge
  const latin = text.match(/\p{Script=Latin}/gu);
  return (latin?.length ?? 0) === letters.length;
}

/**
 * High-precision check: the target language expects a non-Latin script but the
 * output is Latin-only (romanization / wrong language). Returns true when the
 * translation looks untranslated.
 */
export function looksUntranslated(text: string, targetLanguage: string): boolean {
  if (!text) return false;
  if (!expectsNonLatinScript(targetLanguage)) return false;
  return isLatinOnly(text);
}
