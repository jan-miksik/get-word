export interface GoalWeek {
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
