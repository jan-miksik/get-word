'use client';

import { useCallback, useState } from 'react';
import {
  persistFeatureTourAnswered,
  readFeatureTourAnswered,
} from '@/features/learning/app-state/storage';
import type { AppSurface } from '@/features/workspace/public.client';

// One card, not zero: the tour explains the study flow and the two ways words
// get into it, which only lands once the learner has a card in front of them.
// Waiting longer would put it behind the memory-hooks intro at three cards.
const FEATURE_TOUR_MIN_STUDIED_CARDS = 1;

type FeatureTourOptions = {
  activeSurface: AppSurface;
  completedDeckWordCards: number;
};

function readPreviewFeatureTour(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('previewFeatureTour');
}

export function useFeatureTour({ activeSurface, completedDeckWordCards }: FeatureTourOptions) {
  const [isPreviewActive] = useState(readPreviewFeatureTour);
  const [answered, setAnswered] = useState(readFeatureTourAnswered);

  const finishFeatureTour = useCallback(() => {
    persistFeatureTourAnswered(true);
    setAnswered(true);
  }, []);

  const shouldShowFeatureTour =
    !answered &&
    activeSurface === 'study' &&
    (isPreviewActive || completedDeckWordCards >= FEATURE_TOUR_MIN_STUDIED_CARDS);

  return { finishFeatureTour, shouldShowFeatureTour };
}
