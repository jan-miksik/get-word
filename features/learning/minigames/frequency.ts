import {
  DEFAULT_MINIGAME_FREQUENCY,
  MINIGAME_FREQUENCY_MAX,
  MINIGAME_FREQUENCY_MIN,
  type MinigameFrequencyRange,
} from './types';

const MINIGAME_FREQUENCY_STORAGE_KEY = 'get-word-minigame-frequency';

const LEGACY_MINIGAME_FREQUENCIES: Record<string, Exclude<MinigameFrequencyRange, 'off'>> = {
  '2-5': { min: 2, max: 5 },
  '3-7': { min: 3, max: 7 },
  '5-10': { min: 5, max: 10 },
};

function sanitizeMinigameFrequency(
  range: MinigameFrequencyRange,
): MinigameFrequencyRange {
  if (range === 'off') return 'off';

  const min = Number.isFinite(range.min) ? Math.floor(range.min) : DEFAULT_MINIGAME_FREQUENCY.min;
  const max = Number.isFinite(range.max) ? Math.floor(range.max) : DEFAULT_MINIGAME_FREQUENCY.max;
  const clampedMin = Math.max(MINIGAME_FREQUENCY_MIN, Math.min(MINIGAME_FREQUENCY_MAX, min));
  const clampedMax = Math.max(clampedMin, Math.min(MINIGAME_FREQUENCY_MAX, max));
  return { min: clampedMin, max: clampedMax };
}

export function readStoredMinigameFrequency(): MinigameFrequencyRange {
  if (typeof window === 'undefined') return DEFAULT_MINIGAME_FREQUENCY;

  const stored = window.localStorage.getItem(MINIGAME_FREQUENCY_STORAGE_KEY);
  if (!stored) return DEFAULT_MINIGAME_FREQUENCY;
  if (stored === 'off') return 'off';
  if (LEGACY_MINIGAME_FREQUENCIES[stored]) {
    return sanitizeMinigameFrequency(LEGACY_MINIGAME_FREQUENCIES[stored]);
  }

  try {
    const parsed = JSON.parse(stored) as MinigameFrequencyRange;
    if (
      parsed === 'off' ||
      (typeof parsed === 'object' &&
        typeof parsed?.min === 'number' &&
        typeof parsed?.max === 'number')
    ) {
      return sanitizeMinigameFrequency(parsed);
    }
  } catch {
    // Ignore invalid JSON and fall back to defaults.
  }

  return DEFAULT_MINIGAME_FREQUENCY;
}

export function persistMinigameFrequency(range: MinigameFrequencyRange) {
  if (typeof window === 'undefined') return;

  const safe = sanitizeMinigameFrequency(range);
  const value = safe === 'off' ? 'off' : JSON.stringify(safe);
  window.localStorage.setItem(MINIGAME_FREQUENCY_STORAGE_KEY, value);
}
