'use client';

import { useCallback, useRef } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/features/sync/contracts';
import type { FineTuneConfig, ResolvedExercise } from '@/features/learning/fine-tune/types';
import { pickExerciseForWord } from '@/features/learning/fine-tune/pick';
import type { LearningRole } from '@/features/learning/state/learningRole';

export type ExerciseResolver = (word: NormalizedWord, progress: ProgressData) => ResolvedExercise;

/**
 * Resolve which exercise a word gets, and hold that answer steady while the
 * card is on screen.
 *
 * The pick is deterministic in the word and its review count, but whether a
 * variant can be built also depends on the pool of other words — and that pool
 * shrinks as words are learned during a session. Without the lock, a word
 * leaving the stream could flip the current card from multiple choice to typing
 * under the learner's hands. The cache is keyed by review count, so answering
 * the card is exactly what releases it.
 */
export function useExerciseResolver(
  config: FineTuneConfig,
  distractorPool: NormalizedWord[],
  role: LearningRole,
): ExerciseResolver {
  const lockRef = useRef<Map<string, { key: string; exercise: ResolvedExercise }>>(new Map());

  return useCallback(
    (word: NormalizedWord, progress: ProgressData) => {
      const knownCount = progress.knownCount ?? 0;
      const unknownCount = progress.unknownCount ?? 0;
      const key = `${knownCount + unknownCount}:${progress.stageIndex ?? 0}`;

      const cached = lockRef.current.get(word.id);
      if (cached?.key === key) return cached.exercise;

      const exercise = pickExerciseForWord({
        word,
        stageIndex: progress.stageIndex ?? 0,
        knownCount,
        unknownCount,
        config,
        distractorPool,
        role,
      });
      lockRef.current.set(word.id, { key, exercise });
      return exercise;
    },
    [config, distractorPool, role],
  );
}
