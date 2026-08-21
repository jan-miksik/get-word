import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';
import { hasIntroducedWord, type StudyGoalVersion } from '@/packages/domain/goals/goal';
import { resolveGoalTargets } from '@/packages/domain/goals/calibration';
import { planSessionBlocks, type SessionBlock } from './blocks';

export interface SessionPlanInput {
  goal: StudyGoalVersion | null;
  priorityWords: NormalizedWord[];
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  progress: Record<string, ProgressData>;
  absenceDays?: number;
  continueAnyway?: boolean;
  dayTargets?: { resolvedNewTarget: number | null; resolvedReviewTarget: number | null; resolvedItemBudget: number | null } | null;
}

export interface SessionPlan {
  enabled: boolean;
  sessionItemCap: number | null;
  priorityIds: string[];
  dueIds: string[];
  newIds: string[];
  deferredDueCount: number;
  /**
   * How far the day falls short of its own goal because there were not enough
   * words to fill it. It is what turns "you are done" into "you are out of
   * words" — the day is only earned by actually walking the goal.
   */
  shortfall: number;
  /** How many new words the day wanted but the lists could not supply. */
  newShortfall: number;
  /** Explicit targets let the ring describe words mode without guessing from blocks. */
  newTarget?: number;
  reviewTarget?: number;
  reason: 'normal' | 'rampUp' | 'unbounded';
  blocks: SessionBlock[];
  /**
   * Answers already recorded per word when the plan was frozen, for the ids a
   * second-pass block covers. A same-day repeat is "answered twice today",
   * which needs a floor to count from; only repeat ids carry one, so the stored
   * plan does not grow with the whole session.
   */
  answerBaseline?: Record<string, number>;
}

/**
 * New words are the day's growth, repeats its maintenance. The share keeps
 * growth from being crowded out by a large backlog, and the ceiling keeps a
 * generous time budget from turning into twenty-five unknown words in one day.
 */
const NEW_SHARE = 0.3;
const NEW_SHARE_RAMP = 0.4;
const NEW_MIN = 1;
const NEW_MAX = 20;
/** The opening block is a warm-up, not the bulk of the day's repeats. */
const WARM_UP_MAX = 7;
const RAMP_AFTER_ABSENCE_DAYS = 7;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function answerCount(entry: ProgressData | undefined): number {
  return (entry?.knownCount ?? 0) + (entry?.unknownCount ?? 0);
}

/** Pure presentation planner: it neither changes SRS progress nor creates rows. */
export function planSession(input: SessionPlanInput): SessionPlan {
  const { goal } = input;
  if (!goal?.enabled || input.continueAnyway) {
    return {
      enabled: Boolean(goal?.enabled), sessionItemCap: null,
      priorityIds: input.priorityWords.map((word) => word.id),
      dueIds: input.dueWords.map((word) => word.id),
      newIds: input.newWords.map((word) => word.id),
      deferredDueCount: 0,
      shortfall: 0,
      newShortfall: 0,
      reason: input.continueAnyway ? 'unbounded' : 'normal',
      blocks: [],
    };
  }
  const rampUp = (input.absenceDays ?? 0) >= RAMP_AFTER_ABSENCE_DAYS;
  // The session is as long as the *time* budget allows, not as long as the
  // word target — see `calculateWordGoal`. `wordsPerDay` stays the alternative
  // finish line for a learner moving faster than the pacing estimate.
  const resolvedTargets = resolveGoalTargets(goal);
  const isWordsGoal = goal.mode === 'words';
  // The immutable item budget is useful to diagnose backlog, but an actual
  // words-mode session is only as large as today's two resolved targets. In
  // particular, missing content must not silently turn into extra review.
  const cap = isWordsGoal && input.dayTargets
    ? (input.dayTargets.resolvedNewTarget ?? 0) + (input.dayTargets.resolvedReviewTarget ?? 0)
    : input.dayTargets?.resolvedItemBudget ?? resolvedTargets.itemBudget;
  const isNew = (word: NormalizedWord) => !hasIntroducedWord(input.progress[word.id]);

  // A priority word (a personal list item, say) leads its own bucket: unseen
  // ones are new words, the rest are repeats.
  const seen = new Set<string>();
  const take = (words: readonly NormalizedWord[]) => words.filter(
    (word) => !seen.has(word.id) && Boolean(seen.add(word.id)),
  );
  const priorityWords = take(input.priorityWords);
  const priorityIds = new Set(priorityWords.map((word) => word.id));
  const dueWords = take(input.dueWords);
  const newPool = [
    ...priorityWords.filter(isNew),
    ...take(input.newWords),
  ];
  const reviewPool = [
    ...priorityWords.filter((word) => !isNew(word)),
    ...[...dueWords].sort((left, right) => {
      const leftProgress = input.progress[left.id];
      const rightProgress = input.progress[right.id];
      return (leftProgress?.stageIndex ?? 0) - (rightProgress?.stageIndex ?? 0) ||
        (leftProgress?.nextDueAt ?? 0) - (rightProgress?.nextDueAt ?? 0);
    }),
  ];

  const newTarget = isWordsGoal
    ? input.dayTargets?.resolvedNewTarget ?? resolvedTargets.desiredNew
    : clamp(Math.round(cap * (rampUp ? NEW_SHARE_RAMP : NEW_SHARE)), NEW_MIN, NEW_MAX);
  const reviewTarget = isWordsGoal
    ? input.dayTargets?.resolvedReviewTarget ?? resolvedTargets.desiredReviewTarget
    : Math.max(0, cap - newTarget);
  const baseNew = newPool.slice(0, Math.min(newTarget, cap));
  const selectedReview = reviewPool.slice(0, Math.min(reviewTarget, cap - baseNew.length));
  // Repeats did not fill their half of the day. Hand the room back to new words
  // before falling back on repeating what was just seen — real growth beats a
  // second pass, up to the ceiling on how much new ground one day can hold.
  const spare = isWordsGoal ? 0 : cap - baseNew.length - selectedReview.length;
  const selectedNew = spare > 0
    ? newPool.slice(0, Math.min(baseNew.length + spare, NEW_MAX, cap))
    : baseNew;
  const reviewBudget = isWordsGoal ? reviewTarget : cap - selectedNew.length;

  // Coming back after a week starts on new ground rather than on a wall of
  // overdue repeats, so the warm-up is skipped and the whole review budget
  // closes the day.
  const warmUpSize = rampUp
    ? 0
    : Math.min(WARM_UP_MAX, Math.ceil(selectedReview.length / 2));
  const warmUpIds = selectedReview.slice(0, warmUpSize).map((word) => word.id);
  const closingReviewIds = selectedReview.slice(warmUpSize).map((word) => word.id);
  const newIds = selectedNew.map((word) => word.id);

  // Repeats ran out before the budget did: the day is closed with a second pass
  // over today's new words instead of being left short of review entirely.
  const fillWithRepeats = selectedReview.length < reviewBudget && newIds.length > 0;
  const blocks = planSessionBlocks({ warmUpIds, newIds, closingReviewIds, fillWithRepeats });
  // The server earns a day on *distinct* words answered (see `recomputeUserDayStat`),
  // so a day padded out with same-day repeats can still fall short of the goal.
  // That gap is what turns the closing card from "day done" into "you have run
  // out of words" — the day is only earned by walking the whole goal.
  const distinctPlanned = new Set(blocks.flatMap((block) => block.ids)).size;
  const answerBaseline: Record<string, number> = {};
  for (const block of blocks) {
    if ((block.pass ?? 1) < 2) continue;
    for (const id of block.ids) answerBaseline[id] = answerCount(input.progress[id]);
  }

  return {
    enabled: true,
    sessionItemCap: cap,
    priorityIds: selectedReview.filter((word) => priorityIds.has(word.id)).map((word) => word.id),
    dueIds: selectedReview.filter((word) => !priorityIds.has(word.id)).map((word) => word.id),
    newIds,
    deferredDueCount: Math.max(0, reviewPool.length - selectedReview.length),
    shortfall: Math.max(0, cap - distinctPlanned),
    newShortfall: Math.max(0, newTarget - selectedNew.length),
    newTarget,
    reviewTarget,
    reason: rampUp ? 'rampUp' : 'normal',
    blocks,
    answerBaseline,
  };
}
