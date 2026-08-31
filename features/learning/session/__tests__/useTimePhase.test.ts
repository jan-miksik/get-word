import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { __resetActivityDayLedgersForTests } from '@/lib/activity/runtime';
import { useTimePhase } from '../useTimePhase';

describe('useTimePhase', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetActivityDayLedgersForTests();
  });

  it('resumes directly in the server phase without rendering a false boundary first', () => {
    const { result } = renderHook(() => useTimePhase({
      dayKey: '2026-08-29',
      timezone: 'UTC',
      budgetMs: 10 * 60_000,
      serverActiveMs: 6 * 60_000,
      phaseShares: [0.5, 0.5],
    }));

    expect(result.current).toBe(1);
  });
});
