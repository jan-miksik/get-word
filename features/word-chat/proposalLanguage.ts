/**
 * Catch a proposal that came back in English.
 *
 * Every proposed item must be written in the language the learner already knows
 * — the prompt says so several times — but a model that has been reasoning in
 * English sometimes writes the batch in English too, and the learner then gets a
 * card in a language they did not ask to study.
 *
 * There is no language detection here, and deliberately so: the check looks for
 * a handful of English function words that have no common lookalike in the
 * source languages this app serves. Ambiguous tokens are left out on purpose —
 * "to", "a", "do", "on", "i" are ordinary Czech words, "no"/"con" Spanish,
 * "was"/"man"/"die" German, "my" Polish — so a legitimate non-English batch
 * cannot trip the guard by accident.
 */

const ENGLISH_MARKERS = new Set([
  "the",
  "you",
  "your",
  "with",
  "what",
  "which",
  "would",
  "could",
  "should",
  "please",
  "because",
  "about",
  "something",
  "someone",
  "anything",
  "need",
  "needs",
  "want",
  "have",
  "has",
  "they",
  "their",
  "there",
  "this",
  "that",
  "these",
  "those",
  "from",
  "when",
  "where",
  "how",
  "don't",
  "doesn't",
  "isn't",
  "i'm",
  "it's",
  "thanks",
  "thank",
]);

/** Minimum length before an item is judged at all; single words carry no markers. */
const MIN_TOKENS_FOR_JUDGEMENT = 3;

function primaryLanguage(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/, 1)[0] ?? "";
}

function asciiWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

export function proposalLanguageIssue(input: {
  languageFrom: string;
  items: { text?: unknown }[];
}): string | null {
  if (primaryLanguage(input.languageFrom) === "en") return null;

  const phrases = input.items
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .filter((text) => asciiWords(text).length >= MIN_TOKENS_FOR_JUDGEMENT);
  if (phrases.length < 2) return null;

  const englishLike = phrases.filter((text) =>
    asciiWords(text).some((word) => ENGLISH_MARKERS.has(word)),
  );

  // Two independent hits, and at least half the judged items: one English-looking
  // line in an otherwise fine batch is not worth paying for another attempt.
  if (englishLike.length < 2 || englishLike.length * 2 < phrases.length) return null;

  return `${englishLike.length} of ${phrases.length} proposed items look like English, but the learner reads ${input.languageFrom}`;
}
