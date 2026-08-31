import { describe, expect, it } from 'vitest';

import {
  TIME_PHASE_BOUNDARIES,
  computeTimeCountdown,
  timePhaseIndex,
} from '../timeCountdown';

const MINUTE = 60_000;

describe('minutes countdown', () => {
  it('starts with the whole budget on the clock', () => {
    const countdown = computeTimeCountdown(0, 10 * MINUTE);

    expect(countdown.remainingMs).toBe(10 * MINUTE);
    expect(countdown.minutes).toBe(10);
    expect(countdown.remainingFraction).toBe(1);
    expect(countdown.finished).toBe(false);
  });

  it('drains as measured time is spent', () => {
    const countdown = computeTimeCountdown(3 * MINUTE + 30_000, 10 * MINUTE);

    expect(countdown.remainingMs).toBe(6 * MINUTE + 30_000);
    expect(countdown.remainingFraction).toBeCloseTo(0.65, 5);
  });

  it('reaches zero and stays there when the budget is overrun', () => {
    const budget = 10 * MINUTE;
    const atZero = computeTimeCountdown(budget, budget);

    expect(atZero.remainingMs).toBe(0);
    expect(atZero.finished).toBe(true);
    expect(atZero.remainingFraction).toBe(0);

    // Studying on past the goal cannot push the bar below empty.
    const past = computeTimeCountdown(budget + 5 * MINUTE, budget);
    expect(past.remainingMs).toBe(0);
    expect(past.remainingFraction).toBe(0);
  });

  it('rounds a part-minute budget up to the minute it belongs to', () => {
    expect(computeTimeCountdown(0, 90_000).minutes).toBe(2);
  });

  it('treats a missing budget as nothing to count down', () => {
    const countdown = computeTimeCountdown(0, 0);

    expect(countdown.remainingMs).toBe(0);
    expect(countdown.finished).toBe(false);
    expect(countdown.phase).toBe(0);
  });
});

describe('time phases', () => {
  const budget = 10 * MINUTE;

  it('walks the day in three stretches, cut at the declared boundaries', () => {
    expect(TIME_PHASE_BOUNDARIES[0]).toBeCloseTo(1 / 3);
    expect(TIME_PHASE_BOUNDARIES[1]).toBeCloseTo(2 / 3);
    expect(timePhaseIndex(0, budget)).toBe(0);
    expect(timePhaseIndex(3 * MINUTE + 19_999, budget)).toBe(0);
    expect(timePhaseIndex(3 * MINUTE + 20_000, budget)).toBe(1);
    expect(timePhaseIndex(6 * MINUTE + 39_999, budget)).toBe(1);
    expect(timePhaseIndex(6 * MINUTE + 40_000, budget)).toBe(2);
  });

  it('enters the terminal phase once the budget is spent', () => {
    expect(timePhaseIndex(budget - 1, budget)).toBe(2);
    expect(timePhaseIndex(budget, budget)).toBe(3);
    expect(timePhaseIndex(budget * 3, budget)).toBe(3);
  });

  it('supports a first-day half-and-half split', () => {
    const halves = [0.5, 0.5];
    expect(timePhaseIndex(4 * MINUTE + 59_999, budget, halves)).toBe(0);
    expect(timePhaseIndex(5 * MINUTE, budget, halves)).toBe(1);
    expect(timePhaseIndex(budget, budget, halves)).toBe(2);
    expect(computeTimeCountdown(5 * MINUTE, budget, halves).phase).toBe(1);
  });

  it('has no stretches to speak of without a budget', () => {
    expect(timePhaseIndex(5 * MINUTE, 0)).toBe(0);
  });
});
