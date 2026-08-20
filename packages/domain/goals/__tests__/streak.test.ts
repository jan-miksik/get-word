import { describe, expect, it } from 'vitest';
import { calculateStreak } from '../streak';

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
