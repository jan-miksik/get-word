import { splitGraphemes, type AnswerVerdict } from '@/lib/answer-normalization';
import {
  matchAnswerAgainstCandidates,
  type AnswerCandidate,
} from '@/features/learning/minigames/answer-match';

export type TypingOutcome = 'known' | 'stay' | 'unknown';

export type TypingResult = {
  match: AnswerVerdict;
  /** UI tone: typo-accepted answers use the existing "close" presentation. */
  presentation: 'exact' | 'close' | 'typo' | 'wrong';
  matchedAnswer: string;
  isAlternative: boolean;
  outcome: TypingOutcome;
  points: number;
};

export function computeTypingOutcome({
  match,
  hints,
  nearestLetterDistance,
}: {
  match: AnswerVerdict;
  hints: number;
  nearestLetterDistance: number;
}) {
  // Accent-only differences are never stage promotion, but they are not a
  // mistake worth restarting the word for either.
  if (match === 'close') {
    return { match, presentation: 'close' as const, outcome: 'stay' as const, points: 1 };
  }

  // Everything else has to be the right letters. "Almost right" means the same
  // characters wearing different marks (`a`/`ạ`, `d`/`đ`) — never a different
  // letter, a missing one or an extra one, however long the answer is. Typing
  // `y` where the word wants `u` is a wrong answer, not a slip.
  if (match !== 'exact' && nearestLetterDistance > 0) {
    return { match, presentation: 'wrong' as const, outcome: 'unknown' as const, points: 0 };
  }
  if (match === 'exact' && hints === 0) {
    return { match, presentation: 'exact' as const, outcome: 'known' as const, points: 2 };
  }
  return {
    match,
    presentation: match === 'exact' ? 'exact' as const : 'typo' as const,
    outcome: 'stay' as const,
    points: 1,
  };
}

export function evaluateTypingAnswer(
  answer: string,
  candidates: AnswerCandidate[],
  hints: number,
): TypingResult {
  const match = matchAnswerAgainstCandidates(answer, candidates);
  return {
    ...computeTypingOutcome({
      match: match.verdict,
      hints,
      nearestLetterDistance: match.nearestLetterDistance,
    }),
    matchedAnswer: match.matchedAnswer,
    isAlternative: match.isAlternative,
  };
}

export function getMinimumTypingAnswerLength(
  candidates: AnswerCandidate[],
  useFreeAnswerInput: boolean,
  editableCount: number,
): number {
  if (!useFreeAnswerInput) return editableCount;
  const lengths = candidates
    .map((candidate) => splitGraphemes(candidate.answer.trim()).length)
    .filter((length) => length > 0);
  return lengths.length > 0 ? Math.min(...lengths) : 0;
}
