'use client';

import { useCallback, useState } from 'react';

/**
 * The learner's "should cards speak?" setting, flipped by the sound toggle in
 * a card's top lane and stored locally on the device.
 *
 * It is one setting for the whole learning flow, not one per exercise: a
 * learner who silenced a bubble round expects the choice card two swipes later
 * to stay quiet too. Kept under the original `skip` key so an existing choice
 * survives; sound is on unless the learner turned it off.
 */
const SKIP_SOUND_KEY = 'get-word-skip-sound';

function readCardSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(SKIP_SOUND_KEY) !== 'true';
}

/** Reads the setting once per mount, and reports flips back to storage. */
export function useCardSound(): { soundEnabled: boolean; toggleSound: () => void } {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readCardSoundEnabled());

  const toggleSound = useCallback(() => {
    setSoundEnabled((previous) => {
      const next = !previous;
      localStorage.setItem(SKIP_SOUND_KEY, String(!next));
      return next;
    });
  }, []);

  return { soundEnabled, toggleSound };
}
