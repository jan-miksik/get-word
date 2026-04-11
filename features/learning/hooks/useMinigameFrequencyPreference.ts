'use client';

import { useEffect, useState } from 'react';

import {
  DEFAULT_MINIGAME_FREQUENCY,
  persistMinigameFrequency,
  readStoredMinigameFrequency,
  type MinigameFrequencyRange,
} from '@/features/learning/minigames';

export function useMinigameFrequencyPreference() {
  const [minigameFrequency, setMinigameFrequency] = useState<MinigameFrequencyRange>(() =>
    typeof window === 'undefined' ? DEFAULT_MINIGAME_FREQUENCY : readStoredMinigameFrequency(),
  );

  useEffect(() => {
    persistMinigameFrequency(minigameFrequency);
  }, [minigameFrequency]);

  return {
    minigameFrequency,
    setMinigameFrequency,
  };
}
