'use client';

import { useCallback, useRef, useState } from 'react';

import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';

/**
 * What this session has already got through, ahead of the server.
 *
 * Two things run behind the learner's own sense of progress. A card that ends
 * in a check — choice, assembly, typing — holds its verdict until the continue
 * tap, and the deck then writes the SRS answer only once the exit animation
 * ends. Between marking an answer and seeing the rails move there were
 * therefore a tap and an animation. Everything here bridges that gap: the rails
 * read these as work already done, and each record expires by itself as the
 * real progress lands.
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
   * The learner has given their answer — the option is picked, the phrase is
   * checked. This is the moment progress belongs to them, whatever the card
   * still has to show them about it before it will advance.
   */
  recordAnswerGiven: (word: NormalizedWord, progress: Record<string, ProgressData>) => void;
  /**
   * A word card left the deck. Also records the answer, for the reveal card
   * that has no separate check to report — the appearance guard means a card
   * that already reported one is not counted twice.
   */
  recordDeckCardCompleted: (word: NormalizedWord, progress: Record<string, ProgressData>) => void;
  recordGameFinished: (config: { id: string }) => void;
}

function answerCount(entry: ProgressData | undefined): number {
  return (entry?.knownCount ?? 0) + (entry?.unknownCount ?? 0);
}

export function useSessionCompletions(): SessionCompletions {
  const [completedDeckWordCards, setCompletedDeckWordCards] = useState(0);
  const [answeredWords, setAnsweredWords] = useState<readonly NormalizedWord[]>([]);
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, number>>({});
  const [completedGameIds, setCompletedGameIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  /**
   * One appearance reports its answer twice — once when it is marked, once when
   * the card leaves the deck — and both carry the same answer count, because
   * the SRS write happens after the card is gone. Recording the appearance
   * rather than the word is what tells those two apart from the genuine second
   * answer a repeat block asks for, which arrives at a higher count.
   */
  const recordedAppearancesRef = useRef<Set<string>>(new Set());

  const recordAnswerGiven = useCallback(
    (word: NormalizedWord, progress: Record<string, ProgressData>) => {
      const answersAtAnswerTime = answerCount(progress[word.id]);
      const appearance = `${word.id}:${answersAtAnswerTime}`;
      if (recordedAppearancesRef.current.has(appearance)) return;
      recordedAppearancesRef.current.add(appearance);
      setPendingAnswers((previous) => ({ ...previous, [word.id]: answersAtAnswerTime }));
      setAnsweredWords((previous) => [...previous, word]);
    },
    [],
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
