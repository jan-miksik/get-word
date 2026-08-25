'use client';

import { useCallback, useMemo, useState } from 'react';
import type { NormalizedWord } from '@/lib/words';
import {
  availableQuickPracticeMethods,
  type QuickPracticeMethodId,
} from './rounds';

/** What a finished commit tells us about where its words went. */
export type QuickPracticeTarget = {
  listId: string;
  categoryId: string | null;
};

/**
 * Owns the short practice offered after a batch of words is saved.
 *
 * The words themselves are read back out of the synced pool rather than carried
 * over from the add-words flow: by the time the offer is on screen the stream
 * has been rebuilt, so those rows already carry their real ids, audio and
 * language metadata. Reconstructing look-alikes from the draft would have meant
 * a second, subtly different notion of what a study word is.
 */
export function useQuickPractice({
  words,
  /** Bumped by the caller to hand the add-words screen back, emptied. */
  onRestartAddWords,
}: {
  words: NormalizedWord[];
  onRestartAddWords: () => void;
}) {
  const [target, setTarget] = useState<QuickPracticeTarget | null>(null);
  const [method, setMethod] = useState<QuickPracticeMethodId | null>(null);
  const [seed, setSeed] = useState(1);

  const fresh = useMemo(() => {
    if (!target) return [];
    // A batch always lands in one category; without one (a takeover-only save)
    // there is nothing specific to practise.
    if (!target.categoryId) return [];
    return words.filter(
      (word) => word.listId === target.listId && word.categoryId === target.categoryId,
    );
  }, [target, words]);

  const pool = useMemo(() => {
    if (!target) return [];
    const freshIds = new Set(fresh.map((word) => word.id));
    return words.filter((word) => !freshIds.has(word.id));
  }, [fresh, target, words]);

  const methods = useMemo(
    () =>
      fresh.length === 0
        ? []
        : availableQuickPracticeMethods({ fresh, pool, seed }),
    [fresh, pool, seed],
  );

  const start = useCallback((next: QuickPracticeMethodId) => setMethod(next), []);

  const finish = useCallback(() => {
    setMethod(null);
    setTarget(null);
    // A different seed next time, so a learner who practises two batches in a
    // row does not get the same rounds in the same order.
    setSeed((current) => current + 1);
    onRestartAddWords();
  }, [onRestartAddWords]);

  return {
    /** Records where a finished commit put its words; enables the offer. */
    setTarget,
    /** Methods these words can support; empty means do not offer anything. */
    methods,
    fresh,
    pool,
    seed,
    /** The method being played, or null while nothing is running. */
    method,
    start,
    finish,
  };
}
