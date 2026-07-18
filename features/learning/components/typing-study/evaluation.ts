import { splitGraphemes, type AnswerVerdict } from '@/lib/answer-normalization';
import {
  matchAnswerAgainstCandidates,
  type AnswerCandidate,
} from '@/features/learning/minigames/answer-match';

export type TypingOutcome = 'known' | 'stay' | 'unknown';

export type TypingResult = {
  match: AnswerVerdict;
  matchedAnswer: string;
  isAlternative: boolean;
  outcome: TypingOutcome;
  points: number;
};

export function computeTypingOutcome(match: AnswerVerdict, hints: number) {
  if (match === 'exact' && hints === 0) {
    return { match, outcome: 'known' as const, points: 2 };
  }
  if ((match === 'exact' || match === 'close') && hints <= 1) {
    return { match, outcome: 'stay' as const, points: 1 };
  }
  return { match, outcome: 'unknown' as const, points: 0 };
}

export function evaluateTypingAnswer(
  answer: string,
  candidates: AnswerCandidate[],
  hints: number,
): TypingResult {
  const match = matchAnswerAgainstCandidates(answer, candidates);
  return {
    ...computeTypingOutcome(match.verdict, hints),
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
