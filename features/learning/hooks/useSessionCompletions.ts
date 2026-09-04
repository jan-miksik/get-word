'use client';

import { useCallback, useRef, useState } from 'react';

import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';

/**
 * What this session has already got through, ahead of the server.
 *
 * The deck writes an SRS answer when its exit finishes. This state bridges the
 * render where that commit has happened but the optimistic progress snapshot
 * has not caught up yet. A checked-but-unconfirmed answer is deliberately not
 * represented here: advancing the session before Continue could replace the
 * card and strand the write that makes a new word genuinely introduced.
 */
export interface SessionCompletions {
  /** Word cards finished in the deck, however they were answered. */
  completedDeckWordCards: number;
  /**
   * Answered words, each keyed by where it stood when it was answered rather
   * than held as a bare id. The entry then expires on its own as soon as the
   * real answer lands, and a word answered twice in one session — the closing
   * block repeats what the new one introduced — records each answer. Read by
   * `computeBlockProgress`.
   */
  pendingAnswers: Record<string, number>;
  /**
   * Minigame rounds the learner has worked through. A round is a card on the
   * way, so the block rail gives it a slot and fills it from here; nothing
   * about the day's goal moves, which stays counted in words.
   */
  completedGameIds: ReadonlySet<string>;
  /**
   * Every word answered this session, in the order the answers were given.
   *
   * The rails only ever need counts, but a seam between two blocks wants the
   * words themselves: the pause is the one place where the stretch just
   * finished can be shown as words rather than as a number. Kept as a plain
   * log — `useSessionBreather` marks where each block's slice begins, which
   * only works while the log is append-only, so it is never trimmed. It holds
   * references to words that are in memory anyway, and a day's answers are
   * counted in tens.
   */
  answeredWords: readonly NormalizedWord[];
  /**
   * The learner committed the card. This is called from stream view after its
   * outcome and from the deck only after its exit callback applied that outcome.
   */
  recordAnswerGiven: (word: NormalizedWord, progress: Record<string, ProgressData>) => void;
  /**
   * A word card left the deck after its outcome callback ran.
   */
  recordDeckCardCompleted: (word: NormalizedWord, progress: Record<string, ProgressData>) => void;
  recordGameFinished: (config: { id: string }) => void;
}

function answerCount(entry: ProgressData | undefined): number {
  return (entry?.knownCount ?? 0) + (entry?.unknownCount ?? 0);
}

export function useSessionCompletions(
  /**
   * Fires exactly once per genuinely new appearance answered — the same
   * de-dupe guard `recordAnswerGiven` already keeps, so a repeated callback or
   * a minigame round never double-counts. Used to drive the
   * mini-survey progress counter, which needs a view-mode-agnostic "a real
   * answer just happened" signal (`completedDeckWordCards` only increments in
   * card mode).
   */
  onNewAnswerRecorded?: () => void,
): SessionCompletions {
  const [completedDeckWordCards, setCompletedDeckWordCards] = useState(0);
  const [answeredWords, setAnsweredWords] = useState<readonly NormalizedWord[]>([]);
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, number>>({});
  const [completedGameIds, setCompletedGameIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  /**
   * Recording the appearance rather than the bare word distinguishes duplicate
   * completion signals from the genuine second answer a reinforcement block
   * asks for, which arrives at a higher answer count.
   */
  const recordedAppearancesRef = useRef<Set<string>>(new Set());

  const recordAnswerGiven = useCallback(
    (word: NormalizedWord, progress: Record<string, ProgressData>) => {
      const answersAtAnswerTime = answerCount(progress[word.id]);
      const appearance = `${word.id}:${answersAtAnswerTime}`;
      if (recordedAppearancesRef.current.has(appearance)) return;
      recordedAppearancesRef.current.add(appearance);
      onNewAnswerRecorded?.();
      setPendingAnswers((previous) => ({ ...previous, [word.id]: answersAtAnswerTime }));
      setAnsweredWords((previous) => [...previous, word]);
    },
    [onNewAnswerRecorded],
  );

  const recordDeckCardCompleted = useCallback(
    (word: NormalizedWord, progress: Record<string, ProgressData>) => {
      setCompletedDeckWordCards((count) => count + 1);
      recordAnswerGiven(word, progress);
    },
    [recordAnswerGiven],
  );

  const recordGameFinished = useCallback((config: { id: string }) => {
    setCompletedGameIds((previous) => (
      previous.has(config.id) ? previous : new Set([...previous, config.id])
    ));
  }, []);

  return {
    completedDeckWordCards,
    pendingAnswers,
    completedGameIds,
    answeredWords,
    recordAnswerGiven,
    recordDeckCardCompleted,
    recordGameFinished,
  };
}
