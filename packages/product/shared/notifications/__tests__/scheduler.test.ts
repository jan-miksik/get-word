import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../scheduler';

describe('local reminder scheduler', () => {
  it('keeps prompting beyond the current week without duplicating a day', () => {
    const schedule = computeSchedule({
      today: '2026-08-19', localMinutes: 19 * 60, title: 'Study', body: 'A short session',
      day: () => ({ enabled: true, requiredDays: 4, metDaysThisWeek: 0, todayMet: false }),
    });
    expect(schedule.some((item) => item.dayKey > '2026-08-26')).toBe(true);
    expect(new Set(schedule.map((item) => item.dayKey)).size).toBe(schedule.length);
  });

  it('keeps the current week quiet after it is complete', () => {
    const schedule = computeSchedule({
      today: '2026-08-19', localMinutes: 1140, title: 'Study', body: 'A short session',
      day: (day) => ({ enabled: true, requiredDays: 4, metDaysThisWeek: day < '2026-08-24' ? 4 : 0, todayMet: false }),
    });
    expect(schedule[0]?.dayKey).toBe('2026-08-24');
  });
});
