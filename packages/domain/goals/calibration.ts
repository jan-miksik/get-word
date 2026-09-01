import {
  BASE_ITEMS_MAX,
  BASE_ITEMS_MIN,
  SESSION_ITEMS_MAX,
  WORDS_TARGET_SLACK,
  type GoalFineTuneConfig,
  type GoalMinigameFrequency,
  type GoalRevealMode,
  type StudyGoalConfig,
  type StudyPacing,
} from './goal';

const ESTIMATED_SECONDS_PER_ITEM = {
  scratch: 5,
  press: 8,
  choice: 10,
  typing: 20,
  assembly: 14,
  minigame: 10,
} as const;

/**
 * Reveal seconds for a mode that may not be one, in practice.
 *
 * `revealMode` reaches here from stored preferences and from contexts that are
 * still hydrating, so an unknown value is a runtime possibility rather than a
 * type error. Falling back keeps the arithmetic finite: a NaN here surfaces as
 * "NaN new words" on the goal buttons.
 */
function revealSeconds(revealMode: GoalRevealMode): number {
  return ESTIMATED_SECONDS_PER_ITEM[revealMode] ?? ESTIMATED_SECONDS_PER_ITEM.press;
}

function frequencyGap(frequency: GoalMinigameFrequency | null | undefined): number | null {
  if (frequency === 'off') return null;
  if (!frequency || typeof frequency !== 'object') return null;
  const min = Math.max(1, Math.round(frequency.min));
  const max = Math.max(min, Math.round(frequency.max));
  return (min + max) / 2;
}

function stageSeconds(stage: GoalFineTuneConfig['stages'][number] | null | undefined, revealMode: GoalRevealMode): number {
  const methods = [
    { weight: stage?.reveal?.weight, active: (stage?.reveal?.variants?.length ?? 0) > 0, seconds: revealSeconds(revealMode) },
    { weight: stage?.choice?.weight, active: (stage?.choice?.variants?.length ?? 0) > 0, seconds: ESTIMATED_SECONDS_PER_ITEM.choice },
    { weight: stage?.typing?.weight, active: (stage?.typing?.variants?.length ?? 0) > 0, seconds: ESTIMATED_SECONDS_PER_ITEM.typing },
    { weight: stage?.assembly?.weight, active: (stage?.assembly?.variants?.length ?? 0) > 0, seconds: ESTIMATED_SECONDS_PER_ITEM.assembly },
  ].filter((method) => method.active && Number.isFinite(method.weight) && (method.weight ?? 0) > 0);
  if (methods.length === 0) return revealSeconds(revealMode);
  const total = methods.reduce((sum, method) => sum + (method.weight ?? 0), 0);
  return methods.reduce((sum, method) => sum + method.seconds * (method.weight ?? 0), 0) / total;
}

/** Minigames are interleaved between cards, so their cost is spread over them. */
function minigameOverheadSeconds(pacing: StudyPacing): number {
  const gap = frequencyGap(pacing?.minigameFrequency);
  return gap ? ESTIMATED_SECONDS_PER_ITEM.minigame / gap : 0;
}

function finiteSeconds(total: number): number {
  return Number.isFinite(total) && total > 0 ? total : ESTIMATED_SECONDS_PER_ITEM.press;
}

/** Stable pacing estimate; it intentionally does not depend on today's backlog. */
export function estimateSecondsPerItem(pacing: StudyPacing): number {
  const stages = Array.isArray(pacing?.fineTune?.stages) ? pacing.fineTune.stages : [];
  const revealMode = pacing?.revealMode ?? 'press';
  const reviewSeconds = stages.length > 0
    ? stages.reduce((sum, stage) => sum + stageSeconds(stage, revealMode), 0) / stages.length
    : revealSeconds(revealMode);
  return finiteSeconds(reviewSeconds + minigameOverheadSeconds(pacing));
}

/**
 * What a card costs for a word met today, rather than the all-stage average.
 *
 * Both cards a new word owns — the introduction and the reinforcement that
 * follows it in the same session — are drawn from the first fine-tune band,
 * which is normally a bare reveal. Pricing them at `estimateSecondsPerItem`
 * charges them for the typing that only the late bands ask for.
 */
function estimateSecondsPerNewItem(pacing: StudyPacing): number {
  const stages = Array.isArray(pacing?.fineTune?.stages) ? pacing.fineTune.stages : [];
  const revealMode = pacing?.revealMode ?? 'press';
  const firstBandSeconds = stages.length > 0
    ? stageSeconds(stages[0], revealMode)
    : revealSeconds(revealMode);
  return finiteSeconds(firstBandSeconds + minigameOverheadSeconds(pacing));
}

/**
 * `baseItems` is what the estimated pace fits into the time budget, and it is
 * what a session is planned for. `goalWords` is deliberately larger: it is the
 * *alternative* way to finish a day, set for someone moving faster than the
 * estimate, so a quick learner can close the day on count before the clock.
 *
 * The two must not be confused. Planning a session for `goalWords` would size
 * every day at `minutesPerDay * WORDS_TARGET_SLACK` of work — a ten-minute goal
 * quietly becoming twelve and a half — which is exactly what it used to do.
 */
export function calculateWordGoal(minutesPerDay: number, pacing: StudyPacing): {
  baseItems: number;
  goalWords: number;
  sessionItemCap: number;
} {
  const baseItems = Math.max(
    BASE_ITEMS_MIN,
    Math.min(BASE_ITEMS_MAX, Math.round((minutesPerDay * 60) / estimateSecondsPerItem(pacing))),
  );
  const goalWords = Math.min(SESSION_ITEMS_MAX, Math.round(baseItems * WORDS_TARGET_SLACK));
  return { baseItems, goalWords, sessionItemCap: baseItems };
}

/**
 * Recovers the session length from a stored goal version.
 *
 * Only `goalWords` is persisted (`user_study_goal_versions.goal_words_per_day`),
 * so the item count is derived back out of it rather than stored twice and left
 * to drift. The inverse is exact to within the rounding in `calculateWordGoal`.
 */
export function sessionItemCapFromWordGoal(goalWords: number): number {
  return Math.max(BASE_ITEMS_MIN, Math.round(goalWords / WORDS_TARGET_SLACK));
}

export interface ResolvedGoalTargets {
  /** New words asked for before today's availability/backlog snapshot. */
  desiredNew: number;
  /** Unique item slots, not answer events. */
  itemBudget: number;
  desiredReviewTarget: number;
  /** Display-only time budget, derived when words are canonical. */
  minutesPerDay: number;
  /** Compatibility/display word total. */
  wordsPerDay: number;
}

/**
 * How long a words-mode day is expected to take, in seconds.
 *
 * A words day is not `itemBudget` cards. It is `desiredReviewTarget` repeats
 * plus `desiredNew` words met *twice* — the introduction and the same-session
 * reinforcement that always follows it (see `planSessionBlocks`). Sizing the
 * day at the item budget dropped that second pass entirely, and then charged
 * the new-word cards the all-stage average, which happened to cancel most of
 * the shortfall. Both halves are now counted for the reason they exist.
 *
 * This is a display estimate. Words mode plans in distinct words, so nothing
 * here decides how long a session actually runs.
 */
export function estimateWordsSessionSeconds(
  targets: Pick<ResolvedGoalTargets, 'desiredNew' | 'desiredReviewTarget'>,
  pacing: StudyPacing,
): number {
  return (targets.desiredReviewTarget * estimateSecondsPerItem(pacing)) +
    (2 * targets.desiredNew * estimateSecondsPerNewItem(pacing));
}

/**
 * The one translation layer between a durable goal and session planning.
 * Words mode deliberately keeps a 30/70 new/review split before today's
 * availability and backlog policy are applied.
 */
export function resolveGoalTargets(
  goal: Pick<StudyGoalConfig, 'mode' | 'minutesPerDay' | 'wordsPerDay' | 'newWordsPerDay' | 'pacing'>,
): ResolvedGoalTargets {
  if (goal.mode === 'words') {
    const desiredNew = Math.max(0, Math.round(goal.newWordsPerDay ?? goal.wordsPerDay));
    const itemBudget = desiredNew > 0 ? Math.round(desiredNew / 0.3) : 0;
    const desiredReviewTarget = Math.max(0, itemBudget - desiredNew);
    return {
      desiredNew,
      itemBudget,
      desiredReviewTarget,
      minutesPerDay: Math.max(1, Math.ceil(
        estimateWordsSessionSeconds({ desiredNew, desiredReviewTarget }, goal.pacing) / 60,
      )),
      wordsPerDay: desiredNew,
    };
  }
  // Minutes mode predates canonical words targets. Its persisted display word
  // goal is also the frozen session cap, and retaining that inverse preserves
  // its planner/met behavior across this feature.
  const storedWords = Number.isFinite(goal.wordsPerDay) && goal.wordsPerDay > 0
    ? Math.round(goal.wordsPerDay)
    : 0;
  const calculated = storedWords > 0 ? null : calculateWordGoal(goal.minutesPerDay, goal.pacing);
  const itemBudget = storedWords > 0
    ? sessionItemCapFromWordGoal(storedWords)
    : calculated!.sessionItemCap;
  return {
    desiredNew: 0,
    itemBudget,
    desiredReviewTarget: itemBudget,
    minutesPerDay: goal.minutesPerDay,
    wordsPerDay: storedWords || calculated!.goalWords,
  };
}

/** Shared by the live planner and the development forecast. */
export function adjustNewTargetForBacklog(
  desiredNew: number,
  dueReviewCount: number,
  itemBudget: number,
): number {
  if (desiredNew <= 0) return 0;
  const pressure = itemBudget > 0 ? Math.max(0, dueReviewCount) / itemBudget : 0;
  const ratio = Math.max(0.2, 1 - 0.4 * Math.max(0, pressure - 2));
  const minNew = Math.max(1, Math.ceil(desiredNew * 0.2));
  return Math.max(minNew, Math.round(desiredNew * ratio));
}

/**
 * Freeze the two targets for a words-mode day.
 *
 * Due reviews may ease the new-word target through the backlog brake, but a
 * shortage of available new words must not lower it again. The target is the
 * promise the learner chose; availability only decides whether the session can
 * fulfil that promise. Keeping the shortage in the target lets the planner end
 * on "add words" instead of turning a repeats-only session into a completed
 * day.
 */
export function resolveWordsDayTargets(
  targets: Pick<ResolvedGoalTargets, 'desiredNew' | 'itemBudget'>,
  dueReviewCount: number,
): { newTarget: number; reviewTarget: number } {
  const newTarget = adjustNewTargetForBacklog(
    targets.desiredNew,
    dueReviewCount,
    targets.itemBudget,
  );
  return {
    newTarget,
    reviewTarget: Math.min(
      Math.max(0, targets.itemBudget - newTarget),
      Math.max(0, dueReviewCount),
    ),
  };
}
