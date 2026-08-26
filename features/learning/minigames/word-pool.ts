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

function visibleAnswerSignature(value: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
