'use client';

import { useEffect, useState } from 'react';

import {
  getActivityClockState,
  getBestKnownDayActiveMs,
  seedActivityDayTotal,
  setActivityGoalTimezone,
  type ActivityClockState,
} from '@/lib/activity/runtime';

/**
 * The day's measured active time, ticking once a second.
 *
 * There is exactly one source: the activity tracker in
 * `packages/product/shared/activity/tracker`, wired to the browser by
 * `lib/activity/runtime`. It credits time only while the page is visible and
 * focused (or the native shell reports the app foregrounded) *and* the learner
 * interacted within `IDLE_TIMEOUT_MS`. So this hook cannot be made to run by
 * leaving a tab open: it reads a number that stops moving on its own.
 *
 * The server total is seeded rather than added to. `/api/sync` folds the
 * delivered segments into the day, so a client that kept its own running total
 * on top of the server's would count the segment it just delivered twice.
 */
export function useActiveDayMs(
  dayKey: string | null | undefined,
  timezone: string | null | undefined,
  serverActiveMs: number | undefined,
  enabled: boolean,
): number {
  const [activeMs, setActiveMs] = useState(() => serverActiveMs ?? 0);

  // Before the seed, so the first segment this page closes is already bucketed
  // under the same day key the summary asks about.
  useEffect(() => {
    // Only a caller that actually knows the goal's zone gets to set it; the
    // countdown in the settings panel reads the same ledger without one, and
    // clearing it there would re-open the mismatch this closes.
    if (!timezone) return;
    setActivityGoalTimezone(timezone);
  }, [timezone]);

  useEffect(() => {
    if (!dayKey || serverActiveMs === undefined) return;
    seedActivityDayTotal(dayKey, serverActiveMs);
  }, [dayKey, serverActiveMs]);

  useEffect(() => {
    if (!enabled || !dayKey) return;
    const update = () => setActiveMs(getBestKnownDayActiveMs(dayKey));
    update();
    // One second, not the tracker's five: the tracker's own `uncreditedMs`
    // makes the value between credits continuous, so a slower poll would only
    // add stutter to a clock the learner is watching.
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [dayKey, enabled]);

  return activeMs;
}

/**
 * What the day's clock is doing at this instant.
 *
 * The tracker stops crediting time half a minute after the last interaction,
 * again the moment the app is backgrounded, and again on any screen the goal
 * does not credit — all by design, so a tab left open cannot spend the goal.
 * Every one of those is invisible in the digits themselves, which simply stand
 * still and read as a broken clock. Polling at the same second as the clock
 * keeps the two in step, and state is only written when the answer changes.
 */
export function useActivityClockState(enabled: boolean): ActivityClockState {
  const [clock, setClock] = useState<ActivityClockState>('unmeasured');

  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const next = getActivityClockState();
      setClock((current) => (current === next ? current : next));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return enabled ? clock : 'unmeasured';
}
