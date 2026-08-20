'use client';

import { useEffect, useRef, useState } from 'react';

import type { SessionBlockProgress } from './dayProgress';
import type { SessionFlowState } from './flow';

export type SessionBreather =
  | { kind: 'between'; finished: SessionBlockProgress; next: SessionBlockProgress; flow: SessionFlowState }
  | { kind: 'complete'; flow: SessionFlowState };

/**
 * Holds the learner at the seam between two blocks.
 *
 * Blocks only mean something if they are felt, and a boundary that scrolls past
 * silently is not felt. The pause is also the one place with room to say where
 * the day stands, which keeps that number off the study surface entirely.
 *
 * It fires on a *forward* step only. Re-planning, a category filter change or a
 * word bouncing back into the due bucket can move the index around; none of
 * those are an achievement, and none should stop the learner.
 */
export function useSessionBreather(
  flow: SessionFlowState,
  blocks: readonly SessionBlockProgress[],
): { breather: SessionBreather | null; dismiss: () => void } {
  const [breather, setBreather] = useState<SessionBreather | null>(null);
  const seenIndex = useRef<number | null>(null);
  const seenComplete = useRef(false);

  useEffect(() => {
    if (blocks.length === 0) {
      seenIndex.current = null;
      seenComplete.current = false;
      return;
    }
    if (flow.complete) {
      if (!seenComplete.current) {
        seenComplete.current = true;
        setBreather({ kind: 'complete', flow });
      }
      return;
    }
    seenComplete.current = false;
    const previous = seenIndex.current;
    seenIndex.current = flow.index;
    if (previous === null || flow.index <= previous) return;
    const finished = blocks[previous];
    const next = blocks[flow.index];
    if (!finished || !next) return;
    setBreather({ kind: 'between', finished, next, flow });
  }, [blocks, flow]);

  return { breather, dismiss: () => setBreather(null) };
}
