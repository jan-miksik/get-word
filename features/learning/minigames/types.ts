import type { NormalizedWord } from '@/lib/words';
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';

export type GameType = 'multipleChoice' | 'typing' | 'matching' | 'tiltChoice' | 'bubbleChoice' | 'similarWordsPrompt';
export type GameDifficultyLevel = 1 | 2 | 3;
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
  /** Game types that must not be scheduled (e.g. 'typing' while typing mode is the main card). */
  excludeGameTypes?: readonly GameType[];
  /** Experimental game types added to the stable base rotation. */
  includeGameTypes?: readonly GameType[];
  /** Snapshot of the current SRS stage, used only to choose game difficulty. */
  getStageIndex?: (wordId: string) => number;
  /** Per-stage settings; supplies the matching pair count and similarity band. */
  fineTuneConfig?: FineTuneConfig;
}

export interface GameAnchor {
  id: string;
  gameType: GameType;
  level?: GameDifficultyLevel;
  words: NormalizedWord[];
  anchorOriginalIndex: number;
}
