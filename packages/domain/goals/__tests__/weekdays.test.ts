import { describe, expect, it } from 'vitest';
import { normalizeGoalWeekdays } from '../goal';
import { isoWeekday } from '../week';

describe('goal weekdays', () => {
  it('normalizes unique ISO weekdays in calendar order', () => {
    expect(normalizeGoalWeekdays([6, 1, 3, 3, 9])).toEqual([1, 3, 6]);
    expect(normalizeGoalWeekdays(null)).toBeNull();
  });

  it('reads ISO weekdays from local day keys', () => {
    expect(isoWeekday('2026-08-17')).toBe(1);
    expect(isoWeekday('2026-08-23')).toBe(7);
  });
});
