import { describe, expect, it } from 'vitest';

import { segmentPaint } from '../StreakDays';
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

describe('segmentPaint', () => {
  it('fills a met day completely in the review rail colour', () => {
    const paint = segmentPaint(day({ status: 'met' }));
    expect(paint.fill).toBe(1);
    expect(paint.color).toBe('var(--rail-review)');
    expect(paint.cap).toBe(false);
  });

  it('caps an exceeded day above a full fill', () => {
    const paint = segmentPaint(day({ status: 'exceeded' }));
    expect(paint.fill).toBe(1);
    expect(paint.cap).toBe(true);
  });

  it('fills a partial day part of the way, never to the top', () => {
    const partial = segmentPaint(day({ status: 'partial' }));
    expect(partial.fill).toBeGreaterThan(0);
    expect(partial.fill).toBeLessThan(1);
    // Must not be mistakable for a day that was earned.
    expect(partial.cap).toBe(false);
  });

  it('tells "did nothing" apart from "did something"', () => {
    const none = segmentPaint(day({ status: 'none' }));
    const partial = segmentPaint(day({ status: 'partial' }));
    expect(none.fill).toBe(0);
    expect(partial.fill).toBeGreaterThan(0);
    // Both keep the lane, so a short fill reads as a gap rather than as a
    // differently-shaped mark.
    expect(none.track).toBe(true);
    expect(partial.track).toBe(true);
  });

  it('uses the second rail colour for a day outside the preferred weekdays', () => {
    // Still a full day: the weekly target counts days, not which days.
    const paint = segmentPaint(day({ status: 'met', preferred: false }));
    expect(paint.color).toBe('var(--rail-new)');
    expect(paint.fill).toBe(1);
  });

  it('haloes today once it is kept', () => {
    expect(segmentPaint(day({ status: 'met', isToday: true })).halo).toBe('var(--rail-review)');
  });

  it('marks today as "you are here" while it is still open', () => {
    const paint = segmentPaint(day({ isToday: true }));
    // An empty lane with a halo: today has not been filled yet, and the halo is
    // what separates "still open" from a past day that stayed blank.
    expect(paint.track).toBe(true);
    expect(paint.fill).toBe(0);
    expect(paint.halo).toBeDefined();
    expect(segmentPaint(day({ status: 'none' })).halo).toBeUndefined();
  });

  it('does not draw a nothing_due day like a missed one', () => {
    const nothingDue = segmentPaint(day({ status: 'nothing_due' }));
    const missed = segmentPaint(day({ status: 'none' }));
    // No lane at all: there was nothing to fall short of.
    expect(nothingDue.ring).toBe(true);
    expect(nothingDue.track).toBe(false);
    expect(missed.track).toBe(true);
  });

  it('shows the intended rhythm ahead without claiming those days are owed', () => {
    const preferred = segmentPaint(day({ isFuture: true, preferred: true }));
    const other = segmentPaint(day({ isFuture: true, preferred: false }));
    // Drawn as a ring, not a fainter fill: --rail-track is only ~13% opaque, so
    // a percentage of it would be invisible on the warm background.
    expect(preferred.ring).toBe(true);
    expect(other.ring).toBe(false);
    expect(preferred.fill).toBe(0);
    // A day still ahead is not a miss, so it gets no lane either.
    expect(preferred.track).toBe(false);
    expect(preferred.halo).toBeUndefined();
  });

  it('treats a missed preferred day the same as any other missed day', () => {
    // A specific weekday was never owed, so it cannot be a worse miss.
    expect(segmentPaint(day({ status: 'none', preferred: true })))
      .toEqual(segmentPaint(day({ status: 'none', preferred: false })));
  });
});
