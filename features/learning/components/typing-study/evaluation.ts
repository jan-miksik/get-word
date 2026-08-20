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

/** Keep this explicit: tonal marks can become non-typo distinctions later. */
const DIACRITICS_COUNT_AS_TYPOS = true;

function typoBudgetFor(correctAnswer: string, masked: boolean): number {
  const length = splitGraphemes(correctAnswer.trim()).length;
  const budget = Math.floor(length * 0.3);
  // A masked answer has fixed length, so every allowed edit is a free
  // substitution. One is enough forgiveness without making long phrases lax.
  return masked ? Math.min(1, budget) : budget;
}

export function computeTypingOutcome({
  match,
  hints,
  nearestExactDistance,
  correctAnswer,
  masked,
}: {
  match: AnswerVerdict;
  hints: number;
  nearestExactDistance: number;
  correctAnswer: string;
  masked: boolean;
}) {
  // Accent-only differences are never stage promotion. With the flag on they
  // still count in the typo distance, but this branch remains terminal.
  if (match === 'close') {
    return { match, presentation: 'close' as const, outcome: 'stay' as const, points: 1 };
  }

  const distance = match === 'exact' || DIACRITICS_COUNT_AS_TYPOS
    ? nearestExactDistance
    : 0;
  const acceptable = match === 'exact' || distance <= typoBudgetFor(correctAnswer, masked);
  if (!acceptable) {
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
  masked: boolean,
): TypingResult {
  const match = matchAnswerAgainstCandidates(answer, candidates);
  return {
    ...computeTypingOutcome({
      match: match.verdict,
      hints,
      nearestExactDistance: match.nearestExactDistance,
      correctAnswer: match.matchedAnswer,
      masked,
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
