const WEEK_START_DAY = 1;

/** YYYY-MM-DD in the supplied local-day coordinate system, not a UTC instant. */
export function addDays(dayKey: string, amount: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function isoWeekStart(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  return addDays(dayKey, -(weekday - WEEK_START_DAY));
}

export function isoWeekday(dayKey: string): number {
  const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  return weekday || 7;
}
