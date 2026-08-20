import {
  BASE_ITEMS_MAX,
  BASE_ITEMS_MIN,
  SESSION_ITEMS_MAX,
  WORDS_TARGET_SLACK,
  type GoalFineTuneConfig,
  type GoalMinigameFrequency,
  type GoalRevealMode,
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

function frequencyGap(frequency: GoalMinigameFrequency): number | null {
  if (frequency === 'off') return null;
  const min = Math.max(1, Math.round(frequency.min));
  const max = Math.max(min, Math.round(frequency.max));
  return (min + max) / 2;
}

function stageSeconds(stage: GoalFineTuneConfig['stages'][number], revealMode: GoalRevealMode): number {
  const methods = [
    { weight: stage.reveal.weight, active: stage.reveal.variants.length > 0, seconds: revealSeconds(revealMode) },
    { weight: stage.choice.weight, active: stage.choice.variants.length > 0, seconds: ESTIMATED_SECONDS_PER_ITEM.choice },
    { weight: stage.typing.weight, active: stage.typing.variants.length > 0, seconds: ESTIMATED_SECONDS_PER_ITEM.typing },
    { weight: stage.assembly.weight, active: stage.assembly.variants.length > 0, seconds: ESTIMATED_SECONDS_PER_ITEM.assembly },
  ].filter((method) => method.active && Number.isFinite(method.weight) && method.weight > 0);
  if (methods.length === 0) return revealSeconds(revealMode);
  const total = methods.reduce((sum, method) => sum + method.weight, 0);
  return methods.reduce((sum, method) => sum + method.seconds * method.weight, 0) / total;
}

/** Stable pacing estimate; it intentionally does not depend on today's backlog. */
export function estimateSecondsPerItem(pacing: StudyPacing): number {
  const stages = pacing.fineTune.stages;
  const reviewSeconds = stages.length > 0
    ? stages.reduce((sum, stage) => sum + stageSeconds(stage, pacing.revealMode), 0) / stages.length
    : revealSeconds(pacing.revealMode);
  const gap = frequencyGap(pacing.minigameFrequency);
  const total = reviewSeconds + (gap ? ESTIMATED_SECONDS_PER_ITEM.minigame / gap : 0);
  return Number.isFinite(total) && total > 0 ? total : ESTIMATED_SECONDS_PER_ITEM.press;
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
