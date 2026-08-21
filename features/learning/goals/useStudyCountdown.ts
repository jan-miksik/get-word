'use client';

import { useEffect, useState } from 'react';

import { getBestKnownDayActiveMs, seedActivityDayTotal } from '@/lib/activity/runtime';
import type { GoalSummary } from '@/packages/contracts/src/goals';

type GoalDay = GoalSummary['days'][number];

/**
 * Keeps the clock monotonic from the learner's point of view without turning
 * a server refresh into another increment.  `seedActivityDayTotal` replaces a
 * baseline; locally closed segments and the current open segment sit on top
 * only until the next server value incorporates them.
 */
export function useStudyCountdown(day: GoalDay | null, enabled: boolean) {
  const dayKey = day?.dayKey;
  const serverActiveMs = day?.activeMs;
  const [activeMs, setActiveMs] = useState(() => serverActiveMs ?? 0);

  useEffect(() => {
    if (!dayKey || serverActiveMs === undefined) return;
    seedActivityDayTotal(dayKey, serverActiveMs);
  }, [dayKey, serverActiveMs]);

  useEffect(() => {
    if (!enabled || !dayKey) return;
    const update = () => setActiveMs(getBestKnownDayActiveMs(dayKey));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [dayKey, enabled]);

  return { activeMs, day };
}
