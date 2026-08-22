import {
  baseLetterEditDistance,
  getAnswerVerdict,
  isSlotCompatibleAlternative,
  normalizeAnswerCloseKey,
  normalizeAnswerExactKey,
  type AnswerVerdict,
} from '@/lib/answer-normalization';
import { levenshtein } from '@/lib/levenshtein';

export type AnswerCandidate = {
  answer: string;
  isAlternative: boolean;
};

export type AnswerMatchResult = {
  verdict: AnswerVerdict;
  matchedAnswer: string;
  isAlternative: boolean;
  /**
   * Edits that change which letters were written, to the nearest accepted
   * answer. Diacritics are free here, so 0 means the answer is the right
   * letters and nothing else — see `baseLetterEditDistance`.
   */
  nearestLetterDistance: number;
};

export function matchAnswer(input: string, correct: string): AnswerVerdict {
  return getAnswerVerdict(input, correct);
}

function rankVerdict(verdict: AnswerVerdict): number {
  if (verdict === 'exact') return 2;
  if (verdict === 'close') return 1;
  return 0;
}

export function getAcceptedAnswerCandidates(
  primary: string,
  alternatives: string[] | null | undefined,
): AnswerCandidate[] {
  return [
    { answer: primary, isAlternative: false },
    ...(alternatives ?? []).map((answer) => ({ answer, isAlternative: true })),
  ];
}

// True when every alternative can be typed through the primary answer's slot
// mask (same grapheme count, matching punctuation slots). No alternatives → true.
export function alternativesAreSlotCompatible(
  primary: string,
  alternatives: string[],
): boolean {
  return alternatives.every((alternative) =>
    isSlotCompatibleAlternative(primary, alternative),
  );
}

// Explicit check (button / Enter) is needed only when some alternative does
// not fit the primary's slot mask: the mask is replaced by a free-text input
// there, so auto-checking on the last slot has no slot count to fire on.
export function requiresExplicitTypingCheck(candidates: AnswerCandidate[]): boolean {
  const primary = candidates.find((candidate) => !candidate.isAlternative)?.answer ?? '';
  const alternatives = candidates
    .filter((candidate) => candidate.isAlternative)
    .map((candidate) => candidate.answer);
  return alternatives.length > 0 && !alternativesAreSlotCompatible(primary, alternatives);
}

export function matchAnswerAgainstCandidates(
  input: string,
  candidates: AnswerCandidate[],
): AnswerMatchResult {
  const usable = candidates.filter((candidate) => candidate.answer.trim());
  const fallback = usable[0] ?? { answer: '', isAlternative: false };
  const nearestLetterDistance = usable.reduce(
    (nearest, candidate) => Math.min(nearest, baseLetterEditDistance(input, candidate.answer)),
    Number.POSITIVE_INFINITY,
  );
  let best: AnswerMatchResult | null = null;
  for (const candidate of usable) {
    const verdict = getAnswerVerdict(input, candidate.answer);
    if (!best || rankVerdict(verdict) > rankVerdict(best.verdict)) {
      best = {
        verdict,
        matchedAnswer: candidate.answer,
        isAlternative: candidate.isAlternative,
        nearestLetterDistance,
      };
    }
    if (best.verdict === 'exact' && !best.isAlternative) break;
  }
  if (best && best.verdict !== 'wrong') return best;

  const inputKey = normalizeAnswerCloseKey(input);
  let nearest = fallback;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of usable) {
    const distance = levenshtein(inputKey, normalizeAnswerCloseKey(candidate.answer));
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return {
    verdict: 'wrong',
    matchedAnswer: nearest.answer || normalizeAnswerExactKey(fallback.answer),
    isAlternative: nearest.isAlternative,
    nearestLetterDistance,
  };
}
