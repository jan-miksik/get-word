import type { NormalizedWord } from '@/lib/words';
import type { WordSide } from '@/features/learning/state/learningRole';

/** The word's text on one physical side of the pair. */
export function termOnSide(word: NormalizedWord, side: WordSide): string {
  return side === 'from' ? word.cz : word.vi;
}

/** Extra spellings that also count as correct on that side. */
export function acceptedOnSide(word: NormalizedWord, side: WordSide): string[] {
  return side === 'from' ? word.acceptedKnown ?? [] : word.acceptedTarget ?? [];
}

/**
 * Categories that describe a word's *form* rather than its topic. They say
 * nothing about whether two words belong to the same lesson, so they are
 * ignored when deciding which words make sensible companions in one exercise.
 */
const STRUCTURAL_CATEGORIES = new Set(['word', 'phrase']);

/**
 * What the learner would see written, ignoring only the differences the eye
 * does not read as a different word: case, spacing and punctuation.
 *
 * Accents stay in. Folding them away used to make "bàn" and "bán" count as the
 * same visible answer, which quietly barred every real tone twin from ever
 * being offered as an option — in a language where telling those apart is the
 * whole exercise, and where the list often already holds the perfect distractor.
 * Two entries that really are the same word written twice still collide on
 * their other side, which is where this guard catches them.
 */
function visibleAnswerSignature(value: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized || value.trim().toLocaleLowerCase();
}

/**
 * Either study direction may end up on screen, so a distractor is only safe
 * when it differs from the correct answer on *both* sides — otherwise the quiz
 * can render two identical options.
 */
export function hasDistinctVisibleAnswers(left: NormalizedWord, right: NormalizedWord): boolean {
  return (
    visibleAnswerSignature(left.cz) !== visibleAnswerSignature(right.cz) &&
    visibleAnswerSignature(left.vi) !== visibleAnswerSignature(right.vi)
  );
}

function getLearningCategories(word: NormalizedWord): string[] {
  return word.category.filter((category) => !STRUCTURAL_CATEGORIES.has(category));
}

export function sharesLearningScope(
  anchor: NormalizedWord,
  candidate: NormalizedWord,
): boolean {
  const anchorCategories = getLearningCategories(anchor);
  const candidateCategories = getLearningCategories(candidate);

  if (anchorCategories.length === 0 || candidateCategories.length === 0) {
    return anchorCategories.length === candidateCategories.length;
  }

  const candidateSet = new Set(candidateCategories);
  return anchorCategories.some((category) => candidateSet.has(category));
}
