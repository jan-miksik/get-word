import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MINIGAME_FREQUENCY,
  MINIGAME_FREQUENCY_MAX,
  MINIGAME_FREQUENCY_MIN,
  persistMinigameFrequency,
  readStoredMinigameFrequency,
} from '@/features/learning/minigames';

const STORAGE_KEY = 'get-word-minigame-frequency';

describe('minigame frequency', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to a quiz after at most three study cards', () => {
    expect(DEFAULT_MINIGAME_FREQUENCY).toEqual({ min: 2, max: 3 });
    expect(readStoredMinigameFrequency()).toEqual({ min: 2, max: 3 });
  });

  it('offers a scale wide enough for the handle to matter', () => {
    expect(MINIGAME_FREQUENCY_MIN).toBe(1);
    expect(MINIGAME_FREQUENCY_MAX).toBe(8);

    persistMinigameFrequency({ min: 1, max: 8 });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      min: 1,
      max: 8,
    });
  });

  it('clamps a gap outside the scale rather than storing a dead handle position', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ min: 5, max: 20 }));
    expect(readStoredMinigameFrequency()).toEqual({ min: 5, max: 8 });

    // Zero used to sit at the left end of the slider and was read as one by the
    // stream and the goal estimate alike; it never survives as its own value.
    persistMinigameFrequency({ min: 0, max: 0 });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      min: 1,
      max: 1,
    });
  });
});
