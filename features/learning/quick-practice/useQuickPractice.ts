'use client';

import { useCallback, useMemo, useState } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { ProgressData } from '@/features/sync/contracts';
import {
  buildQuickPracticeBlock,
  canQuickPractice,
  QUICK_PRACTICE_BLOCK_ROUNDS,
  rankPracticeWords,
  type PracticeStep,
} from './rounds';

/**
 * Owns the bonus block offered on the card that closes the day.
 *
 * The block is built once, when the learner asks for it, and then held: the
 * study scope underneath can be re-sorted by a sync landing mid-block, and the
 * rounds must not be reshuffled around the question being answered.
 *
 * How far the block has got lives here rather than inside the run, because two
 * separate places draw it: the round itself, inside the study panel, and the
 * rail pinned to the study area's edge — which hangs outside that panel for the
 * same reason a session's own rail does.
 */
export function useQuickPractice({
  words,
  role,
  progress,
  minimumWords,
}: {
  words: NormalizedWord[];
  /** Which side the learner already knows; the assembly cards need it. */
  role: LearningRole;
  /** Used only to choose a useful free-practice pool; never changed here. */
  progress?: Record<string, ProgressData>;
  minimumWords?: number;
}) {
  const [rounds, setRounds] = useState<PracticeStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [seed, setSeed] = useState(1);

  const rankedWords = useMemo(() => rankPracticeWords(words, progress), [progress, words]);
  const available = useMemo(() => canQuickPractice(rankedWords, minimumWords), [minimumWords, rankedWords]);

  const start = useCallback(() => {
    const next = buildQuickPracticeBlock({ words: rankedWords, role, seed });
    // An empty block would open a run with nothing in it; the offer that led
    // here was simply stale.
    setIndex(0);
    setRounds(next.length > 0 ? next : null);
  }, [rankedWords, role, seed]);

  const finish = useCallback(() => {
    setRounds(null);
    setIndex(0);
    // A different seed next time, so a second block is not the first one again.
    setSeed((current) => current + 1);
  }, []);

  /** One round done — the next one, or the end of the block. */
  const advance = useCallback(() => {
    if (!rounds) return;
    if (index + 1 >= rounds.length) {
      finish();
      return;
    }
    setIndex(index + 1);
  }, [finish, index, rounds]);

  return {
    /** Whether the study scope can fill a block; false means offer nothing. */
    available,
    /** How long a full block is, for the copy on the offer. */
    size: QUICK_PRACTICE_BLOCK_ROUNDS,
    /** The block being played, or null while nothing is running. */
    rounds,
    /** Which round of the block is on screen. */
    index,
    start,
    advance,
    finish,
  };
}
