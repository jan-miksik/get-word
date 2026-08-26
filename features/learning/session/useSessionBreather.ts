'use client';

import { useEffect, useRef, useState } from 'react';

import type { SessionBlockProgress } from './dayProgress';
import type { SessionFlowState } from './flow';

export interface SessionBreather {
  finished: SessionBlockProgress;
  next: SessionBlockProgress;
  flow: SessionFlowState;
}

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
 *
 * The end of the day is deliberately not one of these. A seam has something on
 * the far side of it; a finished day does not, so it is a state of the empty
 * deck (`SessionDoneCard`) rather than something to acknowledge and dismiss.
 */
export function useSessionBreather(
  flow: SessionFlowState,
  blocks: readonly SessionBlockProgress[],
): { breather: SessionBreather | null; dismiss: () => void } {
  const [breather, setBreather] = useState<SessionBreather | null>(null);
  const seenIndex = useRef<number | null>(null);

  useEffect(() => {
    if (blocks.length === 0) {
      seenIndex.current = null;
      return;
    }
    // The closing card takes it from here, and the index no longer points at a
    // block — so the seam tracking is left exactly where the last block ended.
    if (flow.complete) return;
    const previous = seenIndex.current;
    seenIndex.current = flow.index;
    if (previous === null || flow.index <= previous) return;
    const finished = blocks[previous];
    const next = blocks[flow.index];
    if (!finished || !next) return;
    setBreather({ finished, next, flow });
  }, [blocks, flow]);

  return { breather, dismiss: () => setBreather(null) };
}
