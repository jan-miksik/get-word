'use client';

import { useEffect, useRef, useState } from 'react';

import type { NormalizedWord } from '@/lib/words';

import type { SessionBlockProgress } from './dayProgress';
import type { SessionFlowState } from './flow';

export interface SessionBreather {
  finished: SessionBlockProgress;
  next: SessionBlockProgress;
  flow: SessionFlowState;
  /**
   * The words answered inside the stretch that just ended, in the order they
   * came up. What the pause is able to *show* rather than count.
   */
  words: readonly NormalizedWord[];
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
  /**
   * The session's answers so far, append-only (`useSessionCompletions`). The
   * slice added since the previous seam is the block that just ended, which is
   * more honest than taking the last `done` entries: a block can be stepped
   * over with words left unanswered, and a game round answers no word at all.
   */
  answeredWords: readonly NormalizedWord[] = [],
  /** Stable identity of the active plan; block keys repeat on a new local day. */
  scopeKey?: string | null,
): { breather: SessionBreather | null; dismiss: () => void } {
  const [breatherState, setBreatherState] = useState<{
    scope: string;
    value: SessionBreather;
  } | null>(null);
  const seenIndex = useRef<number | null>(null);
  const seenAnswers = useRef(0);
  const seenScope = useRef<string | null>(null);
  const activeScope = scopeKey ?? blocks.map((block) => block.key).join('|');
  useEffect(() => {
    if (blocks.length === 0) {
      seenIndex.current = null;
      seenAnswers.current = 0;
      seenScope.current = null;
      return;
    }
    // Switching from the capped day to its frozen overflow replaces the whole
    // plan. Both can start at index zero, so index alone cannot detect it; reset
    // the answer mark here or the first bonus breather would include words from
    // the day that was already closed.
    if (activeScope !== seenScope.current) {
      seenScope.current = activeScope;
      seenIndex.current = flow.complete ? null : flow.index;
      seenAnswers.current = answeredWords.length;
      return;
    }
    // The closing card takes it from here, and the index no longer points at a
    // block — so the seam tracking is left exactly where the last block ended.
    if (flow.complete) return;
    const previous = seenIndex.current;
    const mark = seenAnswers.current;
    seenIndex.current = flow.index;
    // The mark only moves when the block does. This effect re-runs on every
    // answer (the counts it reads are what changed), so advancing it here as
    // well would leave each seam holding the single word that triggered it.
    if (previous === null || flow.index !== previous) {
      seenAnswers.current = answeredWords.length;
    }
    if (previous === null || flow.index <= previous) return;
    const finished = blocks[previous];
    const next = blocks[flow.index];
    if (!finished || !next) return;
    setBreatherState({
      scope: activeScope,
      value: { finished, next, flow, words: answeredWords.slice(mark) },
    });
  }, [activeScope, answeredWords, blocks, flow]);

  return {
    breather: breatherState?.scope === activeScope ? breatherState.value : null,
    dismiss: () => setBreatherState(null),
  };
}
