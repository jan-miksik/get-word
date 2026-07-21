export type SchoolPeriod = 'day' | 'week' | 'month';

export function getUtcPeriodWindow(period: SchoolPeriod, date = new Date()) {
  const dayStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  if (period === 'day') {
    return { start: dayStart, resetAt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };
  }
  if (period === 'week') {
    const daysSinceMonday = (dayStart.getUTCDay() + 6) % 7;
    const start = new Date(dayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
    return { start, resetAt: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return {
    start,
    resetAt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
  };
}
