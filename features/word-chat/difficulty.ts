import type { WordChatLanguageLevel } from "./types";

export type ProposalDifficultyProfile = {
  sentenceCount: number;
  supportCount: number;
  supportKind: "words or short phrases";
};

/**
 * Every level keeps the same compact 3-sentence/7-vocabulary split. CEFR
 * calibration lives in the prompt's word choice and sentence complexity, not in
 * the shape of the proposal.
 */
export function proposalDifficultyProfile(
  _level: WordChatLanguageLevel,
): ProposalDifficultyProfile {
  return { sentenceCount: 3, supportCount: 7, supportKind: "words or short phrases" };
}

type DifficultyCandidate = {
  kind?: unknown;
  role?: unknown;
  text?: unknown;
};

const LANGUAGES_WITHOUT_RELIABLE_SPACE_WORD_BOUNDARIES = new Set([
  "bo",
  "ja",
  "km",
  "ko",
  "lo",
  "my",
  "th",
  "zh",
]);

function primaryLanguage(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/, 1)[0] ?? "";
}

function lexicalTokenCount(text: string): number {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu)).length;
}

/**
 * Return why a higher-level proposal is too starter-like.
 *
 * This deliberately avoids pretending a heuristic can assign CEFR to arbitrary
 * multilingual text. The semantic calibration stays in the model prompt; this
 * guard only catches the concrete failure mode we have observed: very short
 * beginner sentences padded to ten rows with bare topic labels.
 */
export function proposalDifficultyIssue(input: {
  level: WordChatLanguageLevel;
  languageFrom: string;
  items: DifficultyCandidate[];
}): string | null {
  if (input.level !== "B1" && input.level !== "B2" && input.level !== "C1") return null;

  const profile = proposalDifficultyProfile(input.level);
  // Item count on its own is a shape problem, not a difficulty one, and
  // `materializeProposedItems` already clamps and drops rows. Only the missing
  // sentences matter here: they are what "padded to ten rows with bare labels"
  // actually looks like.
  const sentenceCount = input.items.filter((item) => item.kind === "sentence").length;
  if (sentenceCount < profile.sentenceCount) {
    return `${input.level} proposal contains only ${sentenceCount} sentences`;
  }

  if (
    LANGUAGES_WITHOUT_RELIABLE_SPACE_WORD_BOUNDARIES.has(
      primaryLanguage(input.languageFrom),
    )
  ) {
    return null;
  }

  const supportItems = input.items.filter(
    (item) =>
      item.kind !== "sentence" &&
      item.role !== "category_member" &&
      typeof item.text === "string",
  );
  const bareSupportCount = supportItems.filter(
    (item) => lexicalTokenCount(item.text as string) <= 1,
  ).length;

  const sentenceTokenCounts = input.items
    .filter((item) => item.kind === "sentence" && typeof item.text === "string")
    .map((item) => lexicalTokenCount(item.text as string));
  const averageSentenceTokens =
    sentenceTokenCounts.length > 0
      ? sentenceTokenCounts.reduce((sum, count) => sum + count, 0) /
        sentenceTokenCounts.length
      : 0;

  // Both signals have to be near-total before rejecting. A token count is a
  // poor proxy for sentence complexity in synthetic languages — a perfectly
  // good B1 Czech sentence ("Zdá se, že tato položka byla účtována dvakrát.")
  // is only eight tokens, and Ukrainian behaves the same way. Thresholds that
  // merely look "short" would reject those, so they sit low enough that only a
  // genuinely beginner-shaped batch trips them.
  if (
    supportItems.length > 0 &&
    bareSupportCount >= supportItems.length - 1 &&
    averageSentenceTokens > 0 &&
    averageSentenceTokens < 6
  ) {
    return `${input.level} proposal is padded with beginner-style vocabulary labels`;
  }

  return null;
}
