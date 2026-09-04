import { createElement } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChainShape, chainLink } from '../StreakShapes';
import type { StreakDay } from '@/features/learning/goals/streakWeek';

function day(overrides: Partial<StreakDay> = {}): StreakDay {
  return {
    dayKey: '2026-08-24',
    weekday: 1,
    status: 'none',
    preferred: true,
    isToday: false,
    isFuture: false,
    ...overrides,
  };
}

describe('chainLink', () => {
  beforeEach(() => localStorage.clear());

  it('never leaves a day blank, whatever happened on it', () => {
    // The chain reads as one run, so a transparent link would look like the
    // week itself was broken rather than merely uneventful.
    const cases: Array<Partial<StreakDay>> = [
      { status: 'none' },
      { status: 'none', preferred: false },
      { status: 'none', preferred: null },
      { status: 'nothing_due' },
      { status: 'none', isFuture: true },
      { status: 'none', preferred: false, isFuture: true },
    ];
    for (const overrides of cases) {
      expect(chainLink(day(overrides)).fill).toBe('var(--rail-track)');
    }
  });

  it('gives a day off the preferred weekdays the same grey as any other blank day', () => {
    // It was never owed, so it cannot be a worse miss.
    expect(chainLink(day({ preferred: false }))).toEqual(chainLink(day({ preferred: true })));
  });

  it('colours a kept day and casts the link fully', () => {
    const link = chainLink(day({ status: 'met' }));
    expect(link.fill).toBe('var(--rail-review)');
    expect(link.amount).toBe(1);
  });

  it('casts a partial day only part of the way', () => {
    const link = chainLink(day({ status: 'partial' }));
    expect(link.amount).toBeGreaterThan(0);
    expect(link.amount).toBeLessThan(1);
  });

  it('marks a day taken beyond the preferred shape in the second colour', () => {
    expect(chainLink(day({ status: 'met', preferred: false })).fill).toBe('var(--rail-new)');
  });

  it('dims days still ahead instead of dropping them', () => {
    expect(chainLink(day({ isFuture: true })).dim).toBe(true);
    expect(chainLink(day({ isFuture: false })).dim).toBe(false);
  });

  it('haloes today and caps a day that went further', () => {
    expect(chainLink(day({ status: 'met', isToday: true })).halo).toBeDefined();
    expect(chainLink(day({ status: 'exceeded' })).cap).toBe(true);
  });

  it('draws the production viewfinder around today by default', () => {
    const { container } = render(createElement(ChainShape, {
      days: [day({ status: 'met', isToday: true })],
    }));

    expect(container.querySelector('.chain-today-viewfinder')).toBeInTheDocument();
    expect(container.querySelectorAll('.chain-today-viewfinder path')).toHaveLength(4);
  });
});
