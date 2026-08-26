'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MiniGameConfig } from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';
import {
  buildQuickPracticeBlock,
  canQuickPractice,
  QUICK_PRACTICE_BLOCK_ROUNDS,
} from './rounds';

/**
 * Owns the bonus block offered on the card that closes the day.
 *
 * The block is built once, when the learner asks for it, and then held: the
 * study scope underneath can be re-sorted by a sync landing mid-block, and the
 * rounds must not be reshuffled around the question being answered.
 */
export function useQuickPractice({ words }: { words: NormalizedWord[] }) {
  const [rounds, setRounds] = useState<MiniGameConfig[] | null>(null);
  const [seed, setSeed] = useState(1);

  const available = useMemo(() => canQuickPractice(words), [words]);

  const start = useCallback(() => {
    const next = buildQuickPracticeBlock({ words, seed });
    // An empty block would open a run with nothing in it; the offer that led
    // here was simply stale.
    setRounds(next.length > 0 ? next : null);
  }, [seed, words]);

  const finish = useCallback(() => {
    setRounds(null);
    // A different seed next time, so a second block is not the first one again.
    setSeed((current) => current + 1);
  }, []);

  return {
    /** Whether the study scope can fill a block; false means offer nothing. */
    available,
    /** How long a full block is, for the copy on the offer. */
    size: QUICK_PRACTICE_BLOCK_ROUNDS,
    /** The block being played, or null while nothing is running. */
    rounds,
    start,
    finish,
  };
}
