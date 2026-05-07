'use client';

import { useState, useEffect } from 'react';
import { ProgressData } from '@/lib/sync';

const MAX_DELAY = 2147483647; // 2^31 - 1, maximum setTimeout delay

/**
 * Hook that triggers re-renders when words become due for review.
 * Instead of polling, it sets a single timeout for the next card to become due.
 */
export function useDueTimer(progress: Record<string, ProgressData>): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = Date.now();

    // Find all upcoming due timestamps (in the future)
    const upcoming = Object.values(progress)
      .map(p => p.nextDueAt)
      .filter((t): t is number => t !== undefined && t > now)
      .sort((a, b) => a - b);

    if (upcoming.length === 0) return;

    // Set timeout for the next card to become due
    const nextDue = upcoming[0];
    const delay = Math.max(0, nextDue - now + 100); // 100ms buffer for accuracy

    // If delay exceeds platform max, cap it and let the effect re-run when timer fires
    if (delay > MAX_DELAY) {
      const timer = setTimeout(() => {
        setTick(n => n + 1);
      }, MAX_DELAY);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setTick(n => n + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [progress, tick]);

  return tick;
}
