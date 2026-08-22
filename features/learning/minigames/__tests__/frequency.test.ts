import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MINIGAME_FREQUENCY,
  MINIGAME_FREQUENCY_MAX,
  persistMinigameFrequency,
  readStoredMinigameFrequency,
} from '@/features/learning/minigames';

const STORAGE_KEY = 'get-word-minigame-frequency';

describe('minigame frequency', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to a quiz after at most three study cards', () => {
    expect(DEFAULT_MINIGAME_FREQUENCY).toEqual({ min: 2, max: 3 });
    expect(MINIGAME_FREQUENCY_MAX).toBe(3);
    expect(readStoredMinigameFrequency()).toEqual({ min: 2, max: 3 });
  });

  it('clamps older wider gaps so long typing streaks do not return', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ min: 5, max: 10 }));
    expect(readStoredMinigameFrequency()).toEqual({ min: 3, max: 3 });

    persistMinigameFrequency({ min: 1, max: 8 });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      min: 1,
      max: 3,
    });
  });
});
