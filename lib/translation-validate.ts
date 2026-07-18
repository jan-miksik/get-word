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

/* ------------------------------------------------------------------ *
 * Structured, conservative quality warnings.
 *
 * Each check returns a TranslationValidationWarning or null. They are
 * intentionally tuned for PRECISION over recall: a noisy validator that
 * cries wolf on correct rows trains editors to ignore it. Warnings are
 * advisory (editor-facing), never auto-applied.
 * ------------------------------------------------------------------ */

type TranslationWarningCode =
  | "register_marker_mismatch"
  | "missing_target_capitalization"
  | "missing_article_for_noun"
  | "parenthetical_in_translation"
  | "looks_untranslated";

export type TranslationValidationWarning = {
  code: TranslationWarningCode;
  severity: "warning";
  confidence: "high" | "medium";
  message: string;
};

/**
 * A heuristic "is this a full sentence (vs. a single word / short fragment)?"
 * gate. Sentence-level rules (capitalization, register) must only run on
 * sentences so single dictionary items like "und" or "gut" are never flagged.
 */
export function isLikelySentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const hasTerminalPunctuation = /[.!?…]$/.test(trimmed);
  return hasTerminalPunctuation || words.length >= 4;
}

const FRENCH_FORMAL_PRONOUNS = /\b(vous|votre|vos)\b/i;
// Words ending in -ez that are NOT vous-conjugated imperatives.
const FRENCH_EZ_STOPWORDS = new Set(["assez", "chez", "nez", "rez"]);
// French formal/plural imperative: a -ez verb at sentence start ("Répétez …")
// or directly bound to an object pronoun ("Aidez-moi").
function hasFrenchFormalImperative(source: string): boolean {
  const sentenceInitial = source.match(/(?:^|[.!?]\s*)([A-Za-zÀ-ÿ]+ez)\b/);
  if (sentenceInitial && !FRENCH_EZ_STOPWORDS.has(sentenceInitial[1].toLowerCase())) {
    return true;
  }
  const boundToPronoun = source.match(
    /\b([A-Za-zÀ-ÿ]+ez)-(?:moi|nous|vous|le|la|les|leur|lui|y|en)\b/i,
  );
  return Boolean(boundToPronoun && !FRENCH_EZ_STOPWORDS.has(boundToPronoun[1].toLowerCase()));
}

const CZECH_FORMAL_PRONOUNS =
  /\b(vy|vás|vám|vámi|váš|vaše|vaši|vašeho|vašem|vašich)\b/i;

function sourceMarksFormal(source: string, fromLang: string): boolean {
  const lang = baseLanguage(fromLang);
  if (lang === "fr") {
    return FRENCH_FORMAL_PRONOUNS.test(source) || hasFrenchFormalImperative(source);
  }
  if (lang === "cs") {
    return CZECH_FORMAL_PRONOUNS.test(source);
  }
  return false;
}

// Polite "Sie" forms are capitalized in German; matching case-sensitively keeps
// us from confusing them with lowercase "sie" (she/they) or "ihr" (informal).
const GERMAN_FORMAL_MARKERS = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;

/**
 * For a source that explicitly marks FORMAL address (French vous / formal
 * imperative, Czech vy), the German target should carry a formal marker
 * (Sie/Ihnen/Ihr…). If it doesn't, the formality was probably dropped
 * (informal "du/Hilf mir!" or an omitted pronoun "Was tut weh?").
 *
 * Medium confidence: French "vous" / Czech "vy" can also be plural, so this
 * flags a likely problem, not a certainty.
 */
export function registerMarkerMismatch(
  source: string,
  target: string,
  fromLang: string,
  toLang: string,
): TranslationValidationWarning | null {
  if (baseLanguage(toLang) !== "de") return null;
  if (!sourceMarksFormal(source, fromLang)) return null;
  if (GERMAN_FORMAL_MARKERS.test(target)) return null;
  return {
    code: "register_marker_mismatch",
    severity: "warning",
    confidence: "medium",
    message:
      "Source uses formal address but the German target has no formal marker (Sie/Ihnen/Ihr). Check it isn't informal or missing the polite form.",
  };
}

/** First cased letter is lowercase → sentence not capitalized. */
function startsLowercase(text: string): boolean {
  const firstLetter = text.trim().match(/\p{L}/u)?.[0];
  if (!firstLetter) return false;
  const lower = firstLetter.toLowerCase();
  const upper = firstLetter.toUpperCase();
  if (lower === upper) return false; // caseless script (CJK, Arabic, Thai…)
  return firstLetter === lower;
}

/** A full sentence in a cased script must start with a capital letter. */
export function missingTargetCapitalization(
  target: string,
): TranslationValidationWarning | null {
  if (!isLikelySentence(target)) return null;
  if (!startsLowercase(target)) return null;
  return {
    code: "missing_target_capitalization",
    severity: "warning",
    confidence: "high",
    message: "Full sentence should start with a capital letter.",
  };
}

// German targets that are single capitalized words but should NOT carry a
// gendered article: language names and a few common bare/mass nouns.
const GERMAN_ARTICLE_EXCEPTIONS = new Set([
  "Deutsch", "Englisch", "Französisch", "Spanisch", "Italienisch",
  "Tschechisch", "Ukrainisch", "Vietnamesisch", "Russisch",
  "Wasser", "Kleidung",
]);
// Source-side leading article — a strong "this is a bare noun" signal.
const SOURCE_LEADING_ARTICLE: Record<string, RegExp> = {
  fr: /^(le|la|les|l'|un|une|des|du)\s|^l'/i,
  es: /^(el|la|los|las|un|una|unos|unas)\s/i,
  it: /^(il|lo|la|i|gli|le|un|uno|una)\s/i,
  pt: /^(o|a|os|as|um|uma)\s/i,
};

/**
 * German target looks like a bare noun missing its gendered article — but only
 * when the SOURCE explicitly marks a bare noun (a leading article), so we don't
 * guess at part-of-speech. Deliberately narrow: single-token German targets
 * only (so "zu Hause" is skipped), proper nouns / language names excluded.
 */
export function missingArticleForNoun(
  source: string,
  target: string,
  fromLang: string,
  toLang: string,
): TranslationValidationWarning | null {
  if (baseLanguage(toLang) !== "de") return null;
  const trimmedTarget = target.trim();
  if (/\s/.test(trimmedTarget)) return null; // multi-word phrase, not a bare noun
  if (!/^[A-ZÄÖÜ]/.test(trimmedTarget)) return null; // German nouns are capitalized
  if (GERMAN_ARTICLE_EXCEPTIONS.has(trimmedTarget)) return null;

  const articlePattern = SOURCE_LEADING_ARTICLE[baseLanguage(fromLang)];
  if (!articlePattern || !articlePattern.test(source.trim())) return null;

  return {
    code: "missing_article_for_noun",
    severity: "warning",
    confidence: "medium",
    message:
      "Source is a bare noun (has an article) but the German target has no der/die/das. Add the article so the learner gets the gender.",
  };
}

// Matches a parenthetical group "(…)" — ASCII or full-width brackets — and
// captures its inner text so we can compare it against the source.
const PARENTHETICAL_GROUP = /[(（]([^)）]*)[)）]/g;

/**
 * A disambiguation / sense / register hint the source carried in parentheses
 * ("light (color)", "you (informal singular)") must never leak into the target:
 * the translation is the plain word only. Flag any parenthetical in the target
 * unless that exact inner text is literally part of the source (a name or fixed
 * expression that genuinely contains parentheses).
 *
 * High confidence when the source has no parentheses at all (the gloss was
 * clearly added); medium when both sides have one (could be legitimate
 * preservation, but is usually a translated-through gloss).
 */
export function parentheticalInTranslation(
  source: string,
  target: string,
): TranslationValidationWarning | null {
  const matches = [...target.matchAll(PARENTHETICAL_GROUP)];
  if (matches.length === 0) return null;

  const sourceHasParens = /[(（][^)）]*[)）]/.test(source);
  // Preserved verbatim from the source → legitimate, don't flag.
  const allPreserved = matches.every((m) => source.includes(m[0]));
  if (allPreserved) return null;

  return {
    code: "parenthetical_in_translation",
    severity: "warning",
    confidence: sourceHasParens ? "medium" : "high",
    message:
      "Translation contains a parenthetical. A source hint like \"(color)\" or \"(informal)\" is context, not text to translate — keep the target a plain word and move the note to a comment.",
  };
}

/**
 * Run all conservative quality checks for one translated row and collect the
 * warnings. Empty array = nothing to flag.
 */
export function validateTranslation(params: {
  source: string;
  target: string;
  fromLang: string;
  toLang: string;
}): TranslationValidationWarning[] {
  const { source, target, fromLang, toLang } = params;
  const warnings: TranslationValidationWarning[] = [];
  if (!target?.trim()) return warnings;

  if (looksUntranslated(target, toLang)) {
    warnings.push({
      code: "looks_untranslated",
      severity: "warning",
      confidence: "high",
      message: "Target looks untranslated (wrong script or romanization).",
    });
  }

  const register = registerMarkerMismatch(source, target, fromLang, toLang);
  if (register) warnings.push(register);

  const capitalization = missingTargetCapitalization(target);
  if (capitalization) warnings.push(capitalization);

  const article = missingArticleForNoun(source, target, fromLang, toLang);
  if (article) warnings.push(article);

  const parenthetical = parentheticalInTranslation(source, target);
  if (parenthetical) warnings.push(parenthetical);

  return warnings;
}
