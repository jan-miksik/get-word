import { describe, expect, it } from 'vitest';
import { calculateDailyStreak, calculateStreak, calculateWeeklyAdherenceStreak, effectiveWeeklyTarget } from '../streak';

describe('goal streak', () => {
  it('honours grace cooldown carried from an older response window', () => {
    const weeks = Array.from({ length: 8 }, (_, index) => ({
      metDays: index === 0 ? 1 : 4,
      required: 4,
      completed: true,
    }));
    // A grace one week before this window means the first partial week cannot
    // consume another grace; it resets rather than incorrectly extending.
    expect(calculateStreak({ weeks, startingRun: 12, graceCooldownRemainingAtWindowStart: 7 })).toBe(7);
  });

  it('never excuses a zero-activity week', () => {
    expect(calculateStreak({ weeks: [{ metDays: 0, required: 4, completed: true }] })).toBe(0);
  });
});

describe('snapshot streak semantics', () => {
  it('keeps no-content days neutral for the consecutive streak', () => {
    expect(calculateDailyStreak([
      { active: true, met: true, nothingDue: false },
      { active: true, met: false, nothingDue: true },
      { active: true, met: true, nothingDue: false },
      { active: true, met: false, nothingDue: false },
    ])).toBe(2);
  });

  it('uses literal completed-week adherence without a grace week', () => {
    expect(calculateWeeklyAdherenceStreak([
      { active: true, metDays: 3, required: 3 },
      { active: false, metDays: 0, required: 0 },
      { active: true, metDays: 2, required: 3 },
    ])).toBe(1);
  });

  it('reduces weekly adherence only for explicit no-content days', () => {
    expect(effectiveWeeklyTarget(5, 4)).toBe(4);
    // A day without a snapshot remains eligible and must not lower the target.
    expect(effectiveWeeklyTarget(5, 5)).toBe(5);
  });
});
