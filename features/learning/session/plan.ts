import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';
import { hasIntroducedWord, type StudyGoalVersion } from '@/packages/domain/goals/goal';
import { resolveGoalTargets } from '@/packages/domain/goals/calibration';
import { planSessionBlocks, planTimeSessionBlocks, type SessionBlock } from './blocks';

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
  // A summary refresh can create today's measurement row before the first
  // answer. Its targets are intentionally null until the server snapshots the
  // first study event; treating those nulls as zero made a freshly added first
  // list look like an already empty session. Until both targets are frozen,
  // build the client plan from the selected goal. The server then freezes the
  // same first event against the words that actually existed at that moment.
  const dayNewTarget = input.dayTargets?.resolvedNewTarget;
  const dayReviewTarget = input.dayTargets?.resolvedReviewTarget;
  const hasLiveCandidates =
    input.priorityWords.length + input.dueWords.length + input.newWords.length > 0;
  const frozenWordTargets = isWordsGoal &&
    typeof dayNewTarget === 'number' &&
    typeof dayReviewTarget === 'number' &&
    // A day can be snapshotted as `nothing_due` while the learner is still in
    // the add-words flow. Once the freshly committed words arrive, a frozen
    // 0/0 target is stale by definition; using it would discard every live
    // candidate and render the misleading "nothing to review" card.
    (dayNewTarget + dayReviewTarget > 0 || !hasLiveCandidates)
    ? { newTarget: dayNewTarget, reviewTarget: dayReviewTarget }
    : null;
  // The immutable item budget is useful to diagnose backlog, but an actual
  // words-mode session is only as large as today's two resolved targets. In
  // particular, missing content must not silently turn into extra review.
  const cap = frozenWordTargets
    ? frozenWordTargets.newTarget + frozenWordTargets.reviewTarget
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

  const newTarget = frozenWordTargets
    ? frozenWordTargets.newTarget
    : clamp(Math.round(cap * (rampUp ? NEW_SHARE_RAMP : NEW_SHARE)), NEW_MIN, NEW_MAX);
  const reviewTarget = frozenWordTargets
    ? frozenWordTargets.reviewTarget
    : Math.max(0, cap - newTarget);
  const baseNew = newPool.slice(0, Math.min(newTarget, cap));
  const selectedReview = reviewPool.slice(0, Math.min(reviewTarget, cap - baseNew.length));
  // Repeats did not fill their half of the day. Hand the room back to new words
  // before falling back on repeating what was just seen — real growth beats a
  // second pass, up to the ceiling on how much new ground one day can hold.
  const spare = frozenWordTargets ? 0 : cap - baseNew.length - selectedReview.length;
  const selectedNew = spare > 0
    ? newPool.slice(0, Math.min(baseNew.length + spare, NEW_MAX, cap))
    : baseNew;
  const reviewBudget = frozenWordTargets ? reviewTarget : cap - selectedNew.length;

  const reviewIds = selectedReview.map((word) => word.id);
  const newIds = selectedNew.map((word) => word.id);

  // A words day has nothing of its own to repeat, so it closes on a second pass
  // over today's new words instead of being left without review entirely. A day
  // that *does* have repeats already opens on them, and padding its tail with a
  // third stretch is exactly what the two-stretch day drops; the goal is
  // unaffected either way, since it counts distinct words and a same-day repeat
  // adds none.
  const fillWithRepeats = newIds.length > 0 && selectedReview.length === 0;
  // A minutes day is cut by the clock rather than by card counts, so it keeps
  // its three time stretches — and with them the wider fallback, because there
  // the alternative is a closing stretch that runs out at sixty per cent of the
  // budget with the clock still going.
  const fillTimeDayWithRepeats = newIds.length > 0 &&
    (selectedReview.length === 0 || selectedReview.length < reviewBudget);
  const blocks = isWordsGoal
    // Coming back after a week opens on new ground rather than on a wall of
    // overdue repeats.
    ? planSessionBlocks({ reviewIds, newIds, openOnNew: rampUp, fillWithRepeats })
    : planTimeSessionBlocks({
        reviewIds,
        newIds,
        itemBudget: cap,
        fillWithRepeats: fillTimeDayWithRepeats,
        openOnNew: rampUp,
      });
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
