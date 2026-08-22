import { levenshteinTokensWithCost } from "@/lib/levenshtein";

export type AnswerVerdict = "exact" | "close" | "wrong";

// Whitespace and any Unicode punctuation (covers typographic quotes/apostrophes).
// Shared by the typing-mask prefill and the slot-compatibility predicate below —
// both must agree on which characters count as fixed slots.
export const PREFILL_CHAR_RE = /[\s\p{P}]/u;

const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter !== "undefined"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

// User-perceived characters, not code points: combining marks (Thai, etc.)
// must occupy one typing-mask slot. Every consumer that counts or splits an
// answer into slots has to use this, or the mask and the compatibility
// predicate would measure lengths differently.
export function splitGraphemes(value: string): string[] {
  const normalized = value.normalize("NFC");
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(normalized), (part) => part.segment);
  }
  return Array.from(normalized);
}

export function graphemeLength(value: string): number {
  return splitGraphemes(value).length;
}

// True when the alternative can be typed through the primary answer's slot
// mask: same grapheme count, and wherever EITHER side has punctuation/space
// (a fixed, prefilled slot) both sides must hold the identical character —
// the mask prefills fixed slots from the primary and strips typed punctuation,
// so any positional mismatch would be unanswerable.
export function isSlotCompatibleAlternative(primary: string, alternative: string): boolean {
  const primarySlots = splitGraphemes(primary.trim());
  const alternativeSlots = splitGraphemes(alternative.trim());
  if (primarySlots.length === 0 || primarySlots.length !== alternativeSlots.length) {
    return false;
  }
  return primarySlots.every((primarySlot, index) => {
    const alternativeSlot = alternativeSlots[index];
    const hasFixedCharacter =
      PREFILL_CHAR_RE.test(primarySlot) || PREFILL_CHAR_RE.test(alternativeSlot);
    return !hasFixedCharacter || primarySlot === alternativeSlot;
  });
}

// Letters that carry their mark inside the code point, so NFD leaves them
// whole. Each one is the same letter as its base for grading purposes — the
// learner wrote the right letter and got its ornament wrong.
const UNDECOMPOSED_BASE_LETTERS: Record<string, string> = {
  "đ": "d",
  "ð": "d",
  "ø": "o",
  "ł": "l",
  "ŧ": "t",
  "ħ": "h",
  "ı": "i",
};

/**
 * The bare letter behind a grapheme: no marks, no case, no stroke.
 *
 * This is what makes "almost right" a rule rather than a list. `a`/`ă`/`ạ` and
 * `d`/`đ` fold to one base letter and count as the same letter written
 * differently; `u` and `y` do not fold together and stay two different letters.
 */
export function foldToBaseLetter(grapheme: string): string {
  const stripped = grapheme
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase();
  return stripped.replace(
    /[đðøłŧħı]/g,
    (character) => UNDECOMPOSED_BASE_LETTERS[character] ?? character,
  );
}

/** True when two graphemes are the same base letter in different dress. */
export function areOrthographicVariants(a: string, b: string): boolean {
  if (a === b) return true;
  const baseA = foldToBaseLetter(a);
  return baseA.length > 0 && baseA === foldToBaseLetter(b);
}

/**
 * Edits that change *which* characters were written.
 *
 * Diacritic-only substitutions are free; a substitution between two different
 * base letters, an insertion and a deletion each cost one. Zero therefore means
 * "the same characters, some of them decorated differently" — the only kind of
 * mistake the typing card forgives.
 */
export function baseLetterEditDistance(a: string, b: string): number {
  return levenshteinTokensWithCost(
    splitGraphemes(normalizeAnswerExactKey(a)),
    splitGraphemes(normalizeAnswerExactKey(b)),
    (left, right) => (areOrthographicVariants(left, right) ? 0 : 1),
  );
}

export function normalizeAnswerExactKey(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase();
}

export function normalizeAnswerCloseKey(value: string): string {
  return normalizeAnswerExactKey(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
}

export function getAnswerVerdict(input: string, correct: string): AnswerVerdict {
  if (normalizeAnswerExactKey(input) === normalizeAnswerExactKey(correct)) {
    return "exact";
  }
  if (normalizeAnswerCloseKey(input) === normalizeAnswerCloseKey(correct)) {
    return "close";
  }
  return "wrong";
}

export function areAnswersEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeAnswerExactKey(a ?? "") === normalizeAnswerExactKey(b ?? "");
}
