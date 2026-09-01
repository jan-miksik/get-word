import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';
import { hasIntroducedWord, type StudyGoalVersion } from '@/packages/domain/goals/goal';
import { adjustNewTargetForBacklog, resolveGoalTargets } from '@/packages/domain/goals/calibration';
import { planSessionBlocks, planTimeSessionBlocks, type SessionBlock } from './blocks';

export interface SessionPlanInput {
  goal: StudyGoalVersion | null;
  priorityWords: NormalizedWord[];
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  progress: Record<string, ProgressData>;
  absenceDays?: number;
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
  /** Frozen clock split for a minutes day; absent for a words day. */
  timePhaseShares?: number[];
  /** Expected content kind for each clock stretch, including an empty one. */
  timePhaseKinds?: Array<'new' | 'review'>;
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
  if (!goal?.enabled) {
    return {
      enabled: Boolean(goal?.enabled), sessionItemCap: null,
      priorityIds: input.priorityWords.map((word) => word.id),
      dueIds: input.dueWords.map((word) => word.id),
      newIds: input.newWords.map((word) => word.id),
      deferredDueCount: 0,
      shortfall: 0,
      newShortfall: 0,
      reason: 'normal',
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

  if (!isWordsGoal) {
    const hasReviews = reviewPool.length > 0;
    const baseNewTarget = clamp(Math.round(cap / 3), NEW_MIN, Math.min(NEW_MAX, Math.max(NEW_MIN, cap)));
    const backlogNewTarget = adjustNewTargetForBacklog(baseNewTarget, reviewPool.length, cap);
    const maximumNewTarget = Math.min(NEW_MAX, Math.floor(cap / 2));
    // Old reviews may own at most half the session. Even under heavy backlog,
    // reserve the other half for introducing and then checking new material.
    const minimumNewTarget = hasReviews
      // A minutes day promises some growth even under backlog pressure. Each
      // new word owns one introduction slot and one later reinforcement slot;
      // reserving at least 30% of the event budget for introductions leaves at
      // most 40% for the opening backlog and at least 30% for consolidation.
      ? Math.min(maximumNewTarget, Math.max(NEW_MIN, Math.ceil(cap * NEW_SHARE)))
      : NEW_MIN;
    const pacedNewTarget = hasReviews
      ? clamp(backlogNewTarget, minimumNewTarget, maximumNewTarget)
      : maximumNewTarget;
    // Every new word consumes two answer slots: the introduction and the
    // closing reinforcement. The rest of the time budget belongs to the old
    // backlog. This is the key distinction from words mode, whose target is
    // counted in distinct words.
    const reviewTarget = hasReviews
      ? Math.min(Math.floor(cap / 2), Math.max(0, cap - (2 * pacedNewTarget)))
      : 0;
    const newTarget = pacedNewTarget;
    const selectedNew = newPool.slice(0, newTarget);
    const selectedReview = reviewPool.slice(0, reviewTarget);
    const reviewIds = selectedReview.map((word) => word.id);
    const newIds = selectedNew.map((word) => word.id);
    const blocks = planTimeSessionBlocks({ reviewIds, newIds });
    // Shares follow the material actually available for the opening review,
    // while the two new-word stretches reserve the full proportional target.
    // This lets a short opening fall straight into new cards, keeps either new
    // stretch at or below 50%, and never lets backlog swallow the whole lesson.
    const phaseUnits = Math.max(1, reviewIds.length + (2 * newTarget));
    const hasPlannedReviews = reviewIds.length > 0;
    const timePhaseShares = hasPlannedReviews
      ? [reviewIds.length / phaseUnits, newTarget / phaseUnits, newTarget / phaseUnits]
      : [0.5, 0.5];
    const timePhaseKinds = hasPlannedReviews
      ? ['review', 'new', 'review'] as const
      : ['new', 'review'] as const;
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
      shortfall: Math.max(0, cap - reviewIds.length - (2 * newIds.length)),
      newShortfall: Math.max(0, newTarget - selectedNew.length),
      newTarget,
      reviewTarget,
      reason: rampUp ? 'rampUp' : 'normal',
      blocks,
      answerBaseline,
      timePhaseShares,
      timePhaseKinds: [...timePhaseKinds],
    };
  }

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
  const reviewIds = selectedReview.map((word) => word.id);
  const newIds = selectedNew.map((word) => word.id);

  // Every introduced word gets one immediate second pass. This consolidation
  // is deliberately outside the SRS and outside the distinct-word goal; it is
  // the closing C slot whether or not the day also opened on due reviews.
  const fillWithRepeats = newIds.length > 0;
  const blocks = planSessionBlocks({ reviewIds, newIds, fillWithRepeats });
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
