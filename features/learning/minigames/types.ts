import type { NormalizedWord } from '@/lib/words';

export type GameType = 'multipleChoice' | 'typing' | 'matching';
export type GameDifficultyLevel = 1 | 2;
export type MinigameFrequencyRange = { min: number; max: number } | 'off';

export const DEFAULT_MINIGAME_FREQUENCY = { min: 2, max: 5 } satisfies Exclude<
  MinigameFrequencyRange,
  'off'
>;

export const MINIGAME_FREQUENCY_MIN = 0;
export const MINIGAME_FREQUENCY_MAX = 10;

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  level?: GameDifficultyLevel;
  words: NormalizedWord[];
  anchorOriginalIndex?: number;
}

export type StreamItem = NormalizedWord | MiniGameConfig;

export interface InjectMinigamesOptions {
  minInterval?: number;
  maxInterval?: number;
}

export interface GameAnchor {
  id: string;
  gameType: GameType;
  level?: GameDifficultyLevel;
  words: NormalizedWord[];
  anchorOriginalIndex: number;
}
