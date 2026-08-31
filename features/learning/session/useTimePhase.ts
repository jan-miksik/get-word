'use client';

import { useEffect, useState } from 'react';

import {
  getBestKnownDayActiveMs,
  seedActivityDayTotal,
  setActivityGoalTimezone,
} from '@/lib/activity/runtime';
import { timePhaseIndex } from './timeCountdown';

/** How often the clock is asked which stretch the day is in. */
const POLL_MS = 5_000;

export interface TimePhaseInput {
  dayKey: string;
  timezone: string;
  budgetMs: number;
  serverActiveMs: number;
  /** Frozen shares of this day's two or three content stretches. */
  phaseShares?: readonly number[];
}

/**
 * Which stretch of a minutes day the clock has reached.
 *
 * Deliberately not `useActiveDayMs`: that hook returns a number which changes
 * every second, and this value is read by the session flow near the top of the
 * tree. What the flow needs is the phase, which changes twice in a whole
 * session — so the poll is coarse and state is only written when the answer
 * actually differs.
 */
export function useTimePhase(goal: TimePhaseInput | null | undefined): number | undefined {
  const dayKey = goal?.dayKey;
  const timezone = goal?.timezone;
  const budgetMs = goal?.budgetMs ?? 0;
  const serverActiveMs = goal?.serverActiveMs;
  const phaseShares = goal?.phaseShares;
  const phaseKey = `${dayKey ?? '-'}:${budgetMs}:${phaseShares?.join(',') ?? 'default'}`;
  const initialPhase = dayKey && budgetMs > 0
    ? timePhaseIndex(
        Math.max(getBestKnownDayActiveMs(dayKey), serverActiveMs ?? 0),
        budgetMs,
        phaseShares,
      )
    : 0;
  const [storedPhase, setStoredPhase] = useState({ key: phaseKey, value: initialPhase });
  const phase = storedPhase.key === phaseKey ? storedPhase.value : initialPhase;

  useEffect(() => {
    if (!timezone) return;
    setActivityGoalTimezone(timezone);
  }, [timezone]);

  useEffect(() => {
    if (!dayKey || serverActiveMs === undefined) return;
    seedActivityDayTotal(dayKey, serverActiveMs);
  }, [dayKey, serverActiveMs]);

  useEffect(() => {
    if (!dayKey || budgetMs <= 0) return;
    const update = () => {
      const next = timePhaseIndex(getBestKnownDayActiveMs(dayKey), budgetMs, phaseShares);
      setStoredPhase((current) => (
        current.key === phaseKey && current.value === next
          ? current
          : { key: phaseKey, value: next }
      ));
    };
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [budgetMs, dayKey, phaseKey, phaseShares]);

  return dayKey && budgetMs > 0 ? phase : undefined;
}
