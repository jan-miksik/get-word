import { effectiveWeeklyTarget } from './streak';
import { isoWeekday } from './week';

/**
 * How a study day turned out, and the two streaks built on top of it.
 *
 * The goal is a *number of days per week*, and the weekdays a learner picks are
 * preferences rather than a contract: someone who chose Mon/Wed/Fri/Sun and
 * studied Tue/Thu/Sat/Sun kept their goal in full. So nothing here treats a
 * specific missed weekday as a failure — the weekly target is counted, and the
 * chosen days only shape how the week is drawn.
 */

/** Beyond this multiple of the day's target, a day counts as gone further. */
const EXCEEDED_FACTOR = 1.5;

export type DayStatus =
  /** No goal was in force, or the day had nothing to study. Never a failure. */
  | 'nothing_due'
  /** The learner did not study at all. */
  | 'none'
  /** Studied, but not enough to meet the goal. */
  | 'partial'
  | 'met'
  /** Met the goal and kept going well past it. */
  | 'exceeded';

export interface DayStatsInput {
  met: boolean;
  goalStatus: 'active' | 'nothing_due';
  goalMode: 'words' | 'minutes' | null;
  answeredWords: number;
  activeMs: number;
  introducedWords: number;
  reviewedWords: number;
  resolvedNewTarget: number | null;
  resolvedReviewTarget: number | null;
  resolvedItemBudget: number | null;
  resolvedMinutesBudget: number | null;
}

/**
 * Four outcomes instead of a bare met/not-met, derived from the numbers the day
 * rollup already stores — no new column, and no second definition of "met" that
 * could drift from `isDayGoalMet`.
 */
export function resolveDayStatus(day: DayStatsInput): DayStatus {
  if (day.goalStatus === 'nothing_due') return 'nothing_due';
  if (!day.met) {
    // "Did something" is measured by answers, not by time: the clock can run
    // while a card sits open, and that is not study.
    return day.answeredWords > 0 ? 'partial' : 'none';
  }
  return exceededTarget(day) ? 'exceeded' : 'met';
}

function exceededTarget(day: DayStatsInput): boolean {
  if (day.goalMode === 'minutes') {
    const itemBudget = day.resolvedItemBudget ?? 0;
    const msBudget = (day.resolvedMinutesBudget ?? 0) * 60_000;
    if (itemBudget <= 0 && msBudget <= 0) return false;
    return (
      (itemBudget > 0 && day.answeredWords >= itemBudget * EXCEEDED_FACTOR) ||
      (msBudget > 0 && day.activeMs >= msBudget * EXCEEDED_FACTOR)
    );
  }
  // Words mode is judged on the whole day's work, not on new words alone: a day
  // spent clearing a repeat backlog went further too.
  const target = (day.resolvedNewTarget ?? 0) + (day.resolvedReviewTarget ?? 0);
  if (target <= 0) return false;
  return day.introducedWords + day.reviewedWords >= target * EXCEEDED_FACTOR;
}

function isKept(status: DayStatus): boolean {
  return status === 'met' || status === 'exceeded';
}

/**
 * Whether the goal *prefers* this weekday. Not a requirement — see the note at
 * the top. `null` means the goal names no weekdays, so there is no preference
 * to draw either way.
 */
export function preferredForDay(
  goal: { weekdays: number[] | null } | null,
  dayKey: string,
): boolean | null {
  if (!goal) return false;
  if (!goal.weekdays) return null;
  return goal.weekdays.includes(isoWeekday(dayKey));
}

export interface StreakDayInput {
  dayKey: string;
  status: DayStatus;
  /** False for days before the goal existed; those cannot break a streak. */
  hasGoal: boolean;
}

/**
 * Consecutive calendar days on which the goal was met — the ambitious number.
 *
 * Days are supplied newest-first. Studying a little but falling short breaks it
 * just as a blank day does: the figure claims "this many days I hit my goal",
 * and a partial day did not. The week grid is where a partial day still shows,
 * so the effort is visible without the number overstating it.
 */
export function calculateDailyStreak(days: StreakDayInput[], today: string): number {
  let run = 0;
  for (const day of days) {
    // Today is still open — it can add to the run but never end it, because the
    // learner has the rest of their local day to act.
    if (day.dayKey >= today) {
      if (isKept(day.status)) run += 1;
      continue;
    }
    if (!day.hasGoal || day.status === 'nothing_due') continue;
    if (!isKept(day.status)) break;
    run += 1;
  }
  return run;
}

export interface StreakWeekInput {
  /** A week with no goal in force is neutral rather than failed. */
  active: boolean;
  keptDays: number;
  target: number;
  /** The current week cannot fail yet: its remaining days are still available. */
  inProgress: boolean;
}

export interface GoalWeekDayInput {
  hasGoal: boolean;
  daysPerWeek: number | null;
  status: DayStatus;
}

export interface ResolvedGoalWeek extends StreakWeekInput {
  /** A first partial week ended below quota and is neutral rather than failed. */
  partialStartNeutral: boolean;
}

/**
 * Resolve one calendar week's quota without turning registration timing into a
 * failure.
 *
 * An established goal is anchored by Monday, preserving the target that was in
 * force when the week began. A learner's first enabled goal may instead begin
 * later in the week. That first partial week is a one-way opportunity: it joins
 * the streak if the learner fills the quota, but ending below quota is neutral
 * rather than a failure. While the partial week is still in progress it remains
 * pending and shows the full target.
 *
 * Explicit `nothing_due` days can still reduce an otherwise achievable target;
 * they describe unavailable study material, not a calendar made too short by
 * registration.
 */
export function resolveGoalWeek(
  days: readonly GoalWeekDayInput[],
  inProgress: boolean,
): ResolvedGoalWeek {
  const mondayGoal = days[0]?.hasGoal ? days[0] : null;
  const firstGoal = days.find((day) => day.hasGoal) ?? null;
  const partialStart = !mondayGoal && firstGoal !== null;
  const rawTarget = mondayGoal?.daysPerWeek ?? firstGoal?.daysPerWeek ?? 0;
  const eligibleDays = days.filter(
    (day) => day.hasGoal && day.status !== 'nothing_due',
  ).length;
  const nothingDueDays = days.filter(
    (day) => day.hasGoal && day.status === 'nothing_due',
  ).length;
  const keptDays = days.filter(
    (day) => day.hasGoal && isKept(day.status),
  ).length;
  // Pre-registration days are not no-content days and therefore must not shrink
  // the promised quota. Only explicit nothing_due snapshots can do that.
  const target = partialStart
    ? effectiveWeeklyTarget(rawTarget, 7 - nothingDueDays)
    : effectiveWeeklyTarget(rawTarget, eligibleDays);
  const partialStartNeutral = partialStart && !inProgress && keptDays < target;

  return {
    active:
      firstGoal !== null &&
      eligibleDays > 0 &&
      target > 0 &&
      (!partialStartNeutral),
    keptDays,
    target,
    inProgress,
    partialStartNeutral,
  };
}

/**
 * Consecutive weeks whose day quota was filled — the forgiving number.
 *
 * Which days they were never matters. A four-day goal is kept by any four days,
 * so this is the promise the learner actually made, and it is why the daily
 * streak above is allowed to be strict.
 */
export function calculateWeeklyStreak(weeks: StreakWeekInput[]): number {
  let run = 0;
  for (const week of weeks) {
    if (!week.active) continue;
    if (week.keptDays >= week.target) {
      run += 1;
      continue;
    }
    // An unfinished week that has not reached its quota yet is simply pending.
    if (week.inProgress) continue;
    break;
  }
  return run;
}
