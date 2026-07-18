/**
 * Deterministic "formatting polish" for word-list items.
 *
 * This is NOT grammar correction and never rewrites a translation's meaning.
 * It only normalizes mechanical formatting (whitespace, sentence casing, a
 * missing final period) and raises advisory warnings for the cases it cannot
 * safely decide. The guiding rule, for languages that use it:
 *
 *   A clear full sentence starts with a capital letter and ends with . ? or !.
 *
 * The hard part is staying conservative: a vocabulary deck is full of phrases,
 * titles, names, single words and short conjugation drills ("Good day", "from
 * Prague", "I am", "rozumím") that must be left untouched. So an item only
 * counts as a sentence when it is *clearly* one: it already carries terminal
 * punctuation, it opens with an interrogative ("what is this"), or it is a 3+
 * word clause with a personal pronoun or English contraction ("I don't
 * understand"). A single word, on its own, is never a sentence.
 *
 * Source and target are then kept in sync: if EITHER side is a sentence, both
 * are treated as one, so a pro-drop translation ("nerozumím" for "I don't
 * understand.") gets the same capital + period as its partner. When in doubt we
 * do nothing, or warn — never guess.
 *
 * The fixer only ever ADDS a period. Questions and exclamations are surfaced as
 * warnings ("probably needs ?") rather than auto-punctuated, because telling a
 * statement from a question deterministically is not reliable enough to act on.
 */

import { normalizeLanguageCode } from "@/lib/i18n/languages";

export type PolishFixCode =
  | "trim"
  | "collapse_spaces"
  | "space_before_punctuation"
  | "capitalize_sentence"
  | "add_final_period";

export type PolishWarningCode = "maybe_question" | "maybe_exclamation";

type PolishFix = { code: PolishFixCode };
type PolishWarning = { code: PolishWarningCode };

type FieldPolish = {
  original: string;
  /** Text after applying all safe fixes. Equals `original` when nothing changed. */
  fixed: string;
  changed: boolean;
  /** Safe fixes that were applied to reach `fixed`. */
  fixes: PolishFix[];
  /** Advisory issues that were NOT auto-applied. */
  warnings: PolishWarning[];
};

export type PolishFieldInput = { text: string; lang: string };
export type PolishPairResult = { source: FieldPolish; target: FieldPolish };

function baseLanguage(code: string): string {
  return normalizeLanguageCode(code).split("-")[0].toLowerCase();
}

// Languages whose standard orthography uses capital-letter sentence starts and
// `. ? !` terminal punctuation. Anything not listed gets whitespace cleanup
// only — never a casing or period change — so caseless scripts (Arabic, Hebrew,
// Thai, Korean, CJK, Devanagari, …) and unknown languages are left alone.
const SENTENCE_CASE_LANGUAGES = new Set([
  // Latin script
  "en", "de", "fr", "es", "it", "pt", "nl", "ca", "gl", "af",
  "cs", "sk", "pl", "sl", "hr", "bs", "ro", "hu", "fi", "et", "lt", "lv",
  "sv", "no", "nb", "nn", "da", "is", "tr", "id", "ms", "vi", "sq", "cy",
  // Cyrillic script (cased)
  "ru", "uk", "be", "bg", "sr", "mk",
  // Greek
  "el",
]);

// Closed-class personal pronouns — a strong "this is a clause" signal. Kept
// small and high-precision per language; ambiguous tokens are omitted.
const PRONOUNS: Record<string, string[]> = {
  en: ["i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them"],
  de: ["ich", "du", "er", "wir", "mich", "dich", "mir", "dir", "uns", "euch", "ihn", "ihm"],
  fr: ["je", "j", "tu", "il", "elle", "nous", "vous", "ils", "elles", "moi", "toi", "lui"],
  es: ["yo", "tú", "tu", "él", "ella", "nosotros", "vosotros", "ellos", "ellas", "nos"],
  it: ["io", "tu", "lui", "lei", "noi", "voi", "loro", "mi", "ti", "ci", "vi"],
  pt: ["eu", "tu", "ele", "ela", "nós", "vós", "eles", "elas", "me", "te", "nos"],
  cs: ["já", "ty", "on", "ona", "ono", "my", "vy", "oni", "ony", "mě", "mně", "mi", "tě", "ti", "ho", "jej", "ji", "mu", "jí", "nás", "vás", "nám", "vám"],
  sk: ["ja", "ty", "on", "ona", "my", "vy", "oni", "ma", "mi", "ťa", "ti", "ho", "nás", "vás", "nám", "vám"],
  pl: ["ja", "ty", "on", "ona", "ono", "my", "wy", "oni", "mnie", "mi", "cię", "ci", "go", "jej", "nas", "was", "nam", "wam"],
  uk: ["я", "ти", "він", "вона", "воно", "ми", "ви", "вони", "мене", "тебе", "мені", "тобі", "його", "її", "нас", "вас"],
  ru: ["я", "ты", "он", "она", "оно", "мы", "вы", "они", "меня", "тебя", "мне", "тебе", "его", "её", "нас", "вас"],
  vi: ["tôi", "bạn", "mình", "chúng", "nó", "tớ"],
};

// Interrogatives that, at the start of an item, mark it as a question. (For
// Vietnamese, question words tend to sit medially/finally, so it is matched
// anywhere — see `looksInterrogative`.)
const INTERROGATIVES: Record<string, string[]> = {
  en: ["what", "where", "when", "who", "whom", "whose", "why", "how", "which"],
  de: ["was", "wo", "wann", "wer", "wen", "wem", "wessen", "warum", "wieso", "weshalb", "wie", "welche", "welcher", "welches", "wohin", "woher"],
  fr: ["que", "qui", "quoi", "où", "quand", "pourquoi", "comment", "combien", "quel", "quelle", "quels", "quelles"],
  es: ["qué", "quién", "quiénes", "dónde", "cuándo", "cómo", "cuánto", "cuánta", "cuál", "cuáles", "por"],
  it: ["che", "chi", "cosa", "dove", "quando", "perché", "come", "quanto", "quale", "quali"],
  pt: ["que", "quem", "onde", "quando", "porquê", "porque", "como", "quanto", "qual", "quais"],
  cs: ["co", "kde", "kdy", "kdo", "koho", "komu", "proč", "jak", "který", "která", "které", "kolik", "čí", "kam", "odkud"],
  sk: ["čo", "kde", "kedy", "kto", "koho", "komu", "prečo", "ako", "ktorý", "ktorá", "ktoré", "koľko", "kam", "odkiaľ"],
  pl: ["co", "gdzie", "kiedy", "kto", "kogo", "komu", "dlaczego", "jak", "który", "która", "które", "ile", "dokąd", "skąd"],
  uk: ["що", "де", "коли", "хто", "кого", "кому", "чому", "як", "який", "яка", "яке", "скільки", "куди", "звідки"],
  ru: ["что", "где", "когда", "кто", "кого", "кому", "почему", "как", "какой", "какая", "какое", "сколько", "куда", "откуда", "зачем"],
  vi: ["gì", "đâu", "sao", "nào", "ai", "thế", "bao", "tại"],
};

function usesSentenceCasing(lang: string): boolean {
  return SENTENCE_CASE_LANGUAGES.has(baseLanguage(lang));
}

// French keeps a (narrow) space before ; : ! ? — don't strip it there.
function usesFrenchSpacing(lang: string): boolean {
  return baseLanguage(lang) === "fr";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

function hasPronoun(tokens: string[], lang: string): boolean {
  const set = PRONOUNS[baseLanguage(lang)];
  if (!set) return false;
  const lookup = new Set(set);
  return tokens.some((token) => lookup.has(token));
}

/** English contraction (n't / I'm / you're / it's …) — a clear verb-phrase tell. */
function hasEnglishContraction(text: string, lang: string): boolean {
  if (baseLanguage(lang) !== "en") return false;
  return /\b\w+n['’]t\b/i.test(text) || /\b(i|you|we|they|he|she|it)['’](m|re|ve|ll|d|s)\b/i.test(text);
}

function looksInterrogative(tokens: string[], lang: string): boolean {
  const set = INTERROGATIVES[baseLanguage(lang)];
  if (!set || tokens.length === 0) return false;
  const lookup = new Set(set);
  // Vietnamese question words sit medially/finally; elsewhere only a leading
  // interrogative is a reliable signal.
  if (baseLanguage(lang) === "vi") return tokens.some((token) => lookup.has(token));
  return lookup.has(tokens[0]);
}

type TerminalKind = "." | "?" | "!" | "…" | null;

/** Terminal punctuation, ignoring trailing closing quotes/brackets. */
function terminalPunctuation(text: string): TerminalKind {
  const match = text.match(/([.!?…])["'»’”)\]]*\s*$/u);
  if (!match) return null;
  const ch = match[1];
  if (ch === "." || ch === "?" || ch === "!" || ch === "…") return ch;
  return null;
}

/** First cased letter is lowercase → sentence start is not capitalized. */
function startsLowercase(text: string): boolean {
  const firstLetter = text.match(/\p{L}/u)?.[0];
  if (!firstLetter) return false;
  const lower = firstLetter.toLowerCase();
  const upper = firstLetter.toUpperCase();
  if (lower === upper) return false; // caseless script
  return firstLetter === lower;
}

function capitalizeFirstLetter(text: string): string {
  const match = text.match(/\p{L}/u);
  if (!match || match.index === undefined) return text;
  const index = match.index;
  return text.slice(0, index) + text[index].toUpperCase() + text.slice(index + 1);
}

/**
 * Whether a (cleaned) item is, on its own, clearly authored as a full sentence.
 * Deliberately conservative so vocabulary entries are never promoted: a single
 * word is always a word, and a pronoun/contraction only counts inside a longer
 * clause. Cross-pair mirroring is layered on top in `polishPair`; this function
 * judges one field in isolation.
 */
function isAuthoredSentence(cleaned: string, lang: string): boolean {
  if (!cleaned) return false;
  if (terminalPunctuation(cleaned) !== null) return true;
  const tokens = tokenize(cleaned);
  // A single word is a vocabulary item, never a sentence.
  if (tokens.length < 2) return false;
  // A leading interrogative ("what is this") is a strong question signal.
  if (looksInterrogative(tokens, lang)) return true;
  // A pronoun/contraction only implies a sentence in a longer clause — this
  // keeps short drills like "I am" / "pomozte mi" as phrases while still
  // catching real sentences like "I don't understand".
  if (tokens.length < 3) return false;
  return hasPronoun(tokens, lang) || hasEnglishContraction(cleaned, lang);
}

// Remove a space that sits before punctuation. French keeps its space before
// the "high" punctuation marks (; : ! ?), so only . and , are tightened there.
function removeSpaceBeforePunctuation(text: string, lang: string): string {
  // Comma: always tighten.
  let next = text.replace(/\s+,/g, ",");
  // Period: tighten only a lone sentence period — never an ellipsis ("..." or
  // "…"), where a space before the dots is usually intentional ("Já jsem ...").
  next = next.replace(/\s+\.(?!\.)/g, ".");
  if (!usesFrenchSpacing(lang)) {
    next = next.replace(/\s+([;:!?])/g, "$1");
  }
  return next;
}

/**
 * Apply the always-safe whitespace fixes (trim, collapse runs, tighten space
 * before punctuation), recording which ones actually changed the text.
 */
function applyWhitespaceFixes(text: string, lang: string): { value: string; fixes: PolishFix[] } {
  const fixes: PolishFix[] = [];

  const trimmed = text.trim();
  if (trimmed !== text) fixes.push({ code: "trim" });

  const collapsed = trimmed.replace(/[^\S\n]{2,}/g, " ").replace(/\s*\n\s*/g, " ");
  if (collapsed !== trimmed) fixes.push({ code: "collapse_spaces" });

  const tightened = removeSpaceBeforePunctuation(collapsed, lang);
  if (tightened !== collapsed) fixes.push({ code: "space_before_punctuation" });

  return { value: tightened, fixes };
}

/**
 * Polish one source/target pair together. If EITHER side is clearly a sentence,
 * both are treated as one so casing/period stay consistent across the two
 * languages (and a pro-drop one-word translation gets punctuated like its
 * partner). The partner's terminal mark also decides whether a sentence that
 * lacks punctuation gets a warned "?"/"!" instead of an added period.
 */
export function polishPair(
  source: PolishFieldInput,
  target: PolishFieldInput,
): PolishPairResult {
  const cleanedSource = applyWhitespaceFixes(source.text, source.lang);
  const cleanedTarget = applyWhitespaceFixes(target.text, target.lang);

  const pairIsSentence =
    isAuthoredSentence(cleanedSource.value, source.lang) ||
    isAuthoredSentence(cleanedTarget.value, target.lang);

  return {
    source: polishField(source, cleanedSource, {
      isSentence: pairIsSentence,
      pairTerminal: terminalPunctuation(cleanedTarget.value),
    }),
    target: polishField(target, cleanedTarget, {
      isSentence: pairIsSentence,
      pairTerminal: terminalPunctuation(cleanedSource.value),
    }),
  };
}

function polishField(
  input: PolishFieldInput,
  cleaned: { value: string; fixes: PolishFix[] },
  opts: { isSentence: boolean; pairTerminal: TerminalKind },
): FieldPolish {
  const fixes = [...cleaned.fixes];
  const warnings: PolishWarning[] = [];
  let value = cleaned.value;

  const treatAsSentence = value.length > 0 && opts.isSentence && usesSentenceCasing(input.lang);

  if (treatAsSentence) {
    if (startsLowercase(value)) {
      value = capitalizeFirstLetter(value);
      fixes.push({ code: "capitalize_sentence" });
    }

    if (terminalPunctuation(value) === null) {
      const tokens = tokenize(value);
      if (looksInterrogative(tokens, input.lang) || opts.pairTerminal === "?") {
        // Likely a question — but we don't auto-insert "?". Warn instead.
        warnings.push({ code: "maybe_question" });
      } else if (opts.pairTerminal === "!") {
        // The paired side is an exclamation; flag rather than guess "!".
        warnings.push({ code: "maybe_exclamation" });
      } else {
        value = `${value}.`;
        fixes.push({ code: "add_final_period" });
      }
    }
  }

  return {
    original: input.text,
    fixed: value,
    changed: value !== input.text,
    fixes,
    warnings,
  };
}
