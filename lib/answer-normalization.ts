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
