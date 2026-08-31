import type { ProgressData } from '@/features/sync/contracts';
import type { LearningStreamBlock } from '@/features/learning/types';
import { localDayKeyAt } from '@/lib/local-day';
import type { NormalizedWord } from '@/lib/words';
import { hasIntroducedWord } from '@/packages/domain/goals/goal';

export type TimedPhaseKind = 'new' | 'review';

export interface TimedReinforcementSnapshot {
  phase: number;
  answerBaseline: Record<string, number>;
}

interface TimedStreamInput {
  phase: number | undefined;
  phaseKinds: readonly TimedPhaseKind[] | undefined;
  priorityWords: readonly NormalizedWord[];
  priorityDueCount: number;
  dueWords: readonly NormalizedWord[];
  newWords: readonly NormalizedWord[];
  allWords: readonly NormalizedWord[];
  progress: Record<string, ProgressData>;
  pendingAnswers?: Record<string, number>;
  reinforcement: TimedReinforcementSnapshot | null;
}

export interface TimedStreamResolution {
  block: LearningStreamBlock | null;
  /** What the learner is actually doing; the clock rail uses the same answer. */
  activeKind: TimedPhaseKind | null;
  /** An empty new phase asks for material; an empty review phase uses safe practice. */
  emptyKind: TimedPhaseKind | null;
  reinforcement: boolean;
}

function answerCount(entry: ProgressData | undefined): number {
  return (entry?.knownCount ?? 0) + (entry?.unknownCount ?? 0);
}

/** Includes the answer already given while its deck exit is still committing. */
function effectiveAnswerCount(
  wordId: string,
  progress: Record<string, ProgressData>,
  pendingAnswers?: Record<string, number>,
): number {
  const committed = answerCount(progress[wordId]);
  const atTap = pendingAnswers?.[wordId];
  return committed + (atTap !== undefined && committed <= atTap ? 1 : 0);
}

function unique(words: readonly NormalizedWord[]): NormalizedWord[] {
  const seen = new Set<string>();
  return words.filter((word) => !seen.has(word.id) && Boolean(seen.add(word.id)));
}

function introducedOnDay(entry: ProgressData | undefined, dayKey: string, timezone: string): boolean {
  const introducedAt = entry?.introducedAt ?? 0;
  return introducedAt > 0 && localDayKeyAt(introducedAt, timezone) === dayKey;
}

/**
 * Freezes only the answer floor for the closing check, never the new-word pool.
 * Each word introduced in this local day then owes exactly one more answer.
 */
export function captureTimedReinforcement(input: {
  phase: number;
  dayKey: string;
  timezone: string;
  words: readonly NormalizedWord[];
  progress: Record<string, ProgressData>;
  pendingAnswers?: Record<string, number>;
}): TimedReinforcementSnapshot {
  const answerBaseline: Record<string, number> = {};
  for (const word of input.words) {
    const entry = input.progress[word.id];
    const pendingIntroduction = !hasIntroducedWord(entry) && input.pendingAnswers?.[word.id] !== undefined;
    if (!introducedOnDay(entry, input.dayKey, input.timezone) && !pendingIntroduction) continue;
    answerBaseline[word.id] = effectiveAnswerCount(word.id, input.progress, input.pendingAnswers);
  }
  return { phase: input.phase, answerBaseline };
}

function block(
  phase: number,
  kind: TimedPhaseKind,
  words: NormalizedWord[],
  reinforcement = false,
): LearningStreamBlock | null {
  if (words.length === 0) return null;
  return {
    key: `time-${phase}-${reinforcement ? 'reinforcement' : kind}`,
    kind,
    blockIndex: phase,
    ...(reinforcement ? { reinforcement: true as const } : {}),
    words,
  };
}

/**
 * The clock owns a minutes session. Unlike the words planner, this resolver
 * never slices a live pool to a compatibility item target and never serves a
 * future phase while the clock still names the current one.
 */
export function resolveTimedStream(input: TimedStreamInput): TimedStreamResolution {
  const { phase, phaseKinds } = input;
  if (phase === undefined || !phaseKinds || phase >= phaseKinds.length) {
    return { block: null, activeKind: null, emptyKind: null, reinforcement: false };
  }

  const scheduledKind = phaseKinds[phase];
  const newPool = unique([
    ...input.priorityWords.filter((word) => !hasIntroducedWord(input.progress[word.id])),
    ...input.newWords,
  ]);
  const reviewPool = unique([
    ...input.priorityWords.slice(0, input.priorityDueCount).filter((word) => hasIntroducedWord(input.progress[word.id])),
    ...input.dueWords,
  ]);
  const isReinforcement =
    scheduledKind === 'review' &&
    phase > 0 &&
    phaseKinds[phase - 1] === 'new';

  if (isReinforcement) {
    const byId = new Map(input.allWords.map((word) => [word.id, word]));
    const words = Object.entries(input.reinforcement?.answerBaseline ?? {})
      .filter(([id, baseline]) => effectiveAnswerCount(id, input.progress, input.pendingAnswers) <= baseline)
      .map(([id]) => byId.get(id))
      .filter((word): word is NormalizedWord => Boolean(word));
    return {
      block: block(phase, 'review', words, true),
      activeKind: 'review',
      emptyKind: words.length > 0 ? null : 'review',
      reinforcement: true,
    };
  }

  if (scheduledKind === 'new') {
    return {
      block: block(phase, 'new', newPool),
      activeKind: 'new',
      emptyKind: newPool.length > 0 ? null : 'new',
      reinforcement: false,
    };
  }

  // The opening maintenance stretch may genuinely finish early. Continue with
  // live new material instead of padding the beginning with non-progress review;
  // this is the only intentional early hand-off, and it never moves from new
  // words into their future reinforcement.
  if (reviewPool.length === 0 && newPool.length > 0) {
    return {
      block: block(phase, 'new', newPool),
      activeKind: 'new',
      emptyKind: null,
      reinforcement: false,
    };
  }

  return {
    block: block(phase, 'review', reviewPool),
    activeKind: 'review',
    emptyKind: reviewPool.length > 0 ? null : 'review',
    reinforcement: false,
  };
}
