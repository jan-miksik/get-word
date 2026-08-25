interface GoalWeek {
  metDays: number;
  required: number;
  completed: boolean;
}

export interface StreakInput {
  weeks: GoalWeek[];
  startingRun?: number;
  /** 0–7 completed weeks that still cannot consume another grace. */
  graceCooldownRemainingAtWindowStart?: number;
}

export function calculateStreak({
  weeks,
  startingRun = 0,
  graceCooldownRemainingAtWindowStart = 0,
}: StreakInput): number {
  let run = startingRun;
  let lastGraceIndex = -(8 - Math.max(0, Math.min(7, graceCooldownRemainingAtWindowStart)));
  for (let index = 0; index < weeks.length; index += 1) {
    const week = weeks[index];
    if (!week.completed) continue;
    if (week.metDays >= week.required) {
      run += 1;
    } else if (week.metDays >= 1 && index - lastGraceIndex >= 8) {
      lastGraceIndex = index;
      run += 1;
    } else {
      run = 0;
    }
  }
  return run;
}

/** Consecutive completed active days, with no-content days explicitly neutral. */
export function calculateDailyStreak(days: Array<{
  active: boolean;
  met: boolean;
  nothingDue: boolean;
}>): number {
  let run = 0;
  for (const day of days) {
    if (!day.active || day.nothingDue) continue;
    if (!day.met) break;
    run += 1;
  }
  return run;
}

/**
 * Unlike the legacy weekly grace streak, adherence is literal: every complete
 * week with an active Monday target must meet that target. Weeks without a
 * target are neutral and therefore do not fabricate a streak.
 */
export function calculateWeeklyAdherenceStreak(weeks: Array<{
  active: boolean;
  metDays: number;
  required: number;
}>): number {
  let run = 0;
  for (const week of weeks) {
    if (!week.active) continue;
    if (week.metDays < week.required) break;
    run += 1;
  }
  return run;
}

/** Explicit no-content snapshots reduce a weekly target, absent snapshots do not. */
export function effectiveWeeklyTarget(weeklyDaysTarget: number, activeEligibleDays: number): number {
  return Math.max(0, Math.min(Math.max(0, weeklyDaysTarget), Math.max(0, activeEligibleDays)));
}
