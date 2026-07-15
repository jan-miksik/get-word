import { describe, expect, it } from "vitest";
import {
  graphemeLength,
  isSlotCompatibleAlternative,
  splitGraphemes,
} from "@/lib/answer-normalization";
import {
  AcceptedAnswersValidationError,
  MAX_ACCEPTED_ANSWER_LENGTH,
  normalizeAcceptedAnswersForAiSuggestions,
  normalizeAcceptedAnswersForDisplay,
  normalizeAcceptedAnswersForSave,
} from "@/lib/word-item-accepted-answers";

describe("slot-compatible alternatives", () => {
  it("accepts same-length alternatives without punctuation", () => {
    expect(isSlotCompatibleAlternative("dobrý", "dobrá")).toBe(true);
  });

  it("rejects alternatives with a different grapheme count", () => {
    expect(isSlotCompatibleAlternative("dobrý", "dobřejší")).toBe(false);
    expect(isSlotCompatibleAlternative("dobrý", "dobr")).toBe(false);
  });

  it("counts graphemes, not code units (NFD input)", () => {
    // "dobre" + combining acute = "dobré" after NFC; same 5 slots as "dobrý".
    expect(isSlotCompatibleAlternative("dobrý", "dobré")).toBe(true);
    expect(graphemeLength("dobré")).toBe(5);
  });

  it("treats combining marks as one slot (Thai)", () => {
    // U+0E19 U+0E49 U+0E33 = น้ำ ("water"): 3 code points, 1 grapheme cluster.
    expect(splitGraphemes("น้ำ")).toHaveLength(1);
    expect(isSlotCompatibleAlternative("น้ำ", "a")).toBe(true);
    expect(isSlotCompatibleAlternative("น้ำ", "ab")).toBe(false);
  });

  it("accepts multi-word alternatives with the space in the same slot", () => {
    expect(isSlotCompatibleAlternative("ice cream", "icy cream")).toBe(true);
  });

  it("rejects punctuation/space slot mismatches in either direction", () => {
    // Primary has a space where the alternative has a letter…
    expect(isSlotCompatibleAlternative("ice cream", "icecreams")).toBe(false);
    // …and the alternative has punctuation where the primary has a letter.
    expect(isSlotCompatibleAlternative("cannot", "can't!")).toBe(false);
  });

  it("rejects empty primaries", () => {
    expect(isSlotCompatibleAlternative("", "")).toBe(false);
    expect(isSlotCompatibleAlternative(" ", "a")).toBe(false);
  });
});

describe("word item accepted answers", () => {
  it("normalizes display values without throwing", () => {
    expect(
      normalizeAcceptedAnswersForDisplay(
        [" dobrá ", "", "DOBRÁ", "dobre\u0301", "dobré"],
        "dobrý",
      ),
    ).toEqual(["dobrá", "dobré"]);
  });

  it("removes variants equivalent to the primary answer", () => {
    expect(normalizeAcceptedAnswersForSave([" Dobrý ", "dobrá"], "dobrý")).toEqual([
      "dobrá",
    ]);
  });

  it("preserves first valid variant order", () => {
    expect(normalizeAcceptedAnswersForSave(["dobrá", "dobré", "dobře"], "dobrý")).toEqual([
      "dobrá",
      "dobré",
      "dobře",
    ]);
  });

  it("rejects manual/API input over count or length limits", () => {
    expect(() =>
      normalizeAcceptedAnswersForSave(
        Array.from({ length: 11 }, (_, index) => `v${index}`),
        "main",
      ),
    ).toThrow(AcceptedAnswersValidationError);
    expect(() =>
      normalizeAcceptedAnswersForSave(["x".repeat(MAX_ACCEPTED_ANSWER_LENGTH + 1)], "main"),
    ).toThrow(AcceptedAnswersValidationError);
  });

  it("drops invalid AI suggestions instead of truncating text", () => {
    expect(
      normalizeAcceptedAnswersForAiSuggestions(
        ["dobrá", "x".repeat(MAX_ACCEPTED_ANSWER_LENGTH + 1), "dobré", "dobrá"],
        "dobrý",
      ),
    ).toEqual(["dobrá", "dobré"]);
  });

  it("does not return already stored AI suggestions", () => {
    expect(
      normalizeAcceptedAnswersForAiSuggestions(["dobrá", "dobré"], "dobrý", ["DOBRÁ"]),
    ).toEqual(["dobré"]);
  });

  it("drops AI suggestions whose length or punctuation slots differ from the primary", () => {
    expect(
      normalizeAcceptedAnswersForAiSuggestions(
        ["dobrá", "dobřejší", "dobr", "dob-á"],
        "dobrý",
      ),
    ).toEqual(["dobrá"]);
  });

  it("drops accent-only and close-equivalent AI misspellings", () => {
    expect(normalizeAcceptedAnswersForAiSuggestions(["děn", "den!"], "den")).toEqual([]);
    expect(normalizeAcceptedAnswersForAiSuggestions(["Nevim", "Netuším"], "Nevím")).toEqual([]);
  });

  it("keeps up to five structurally valid AI suggestions", () => {
    expect(
      normalizeAcceptedAnswersForAiSuggestions(
        ["aaaa", "bbbb", "cccc", "dddd", "eeee", "ffff"],
        "main",
      ),
    ).toEqual(["aaaa", "bbbb", "cccc", "dddd", "eeee"]);
  });
});
