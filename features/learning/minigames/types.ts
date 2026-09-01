import type { NormalizedWord } from '@/lib/words';
import type { FineTuneConfig, SimilarityBand } from '@/features/learning/fine-tune/types';

export type GameType = 'multipleChoice' | 'typing' | 'matching' | 'tiltChoice' | 'bubbleChoice' | 'similarWordsPrompt';
export type GameDifficultyLevel = 1 | 2 | 3;
export type MinigameFrequencyRange = { min: number; max: number } | 'off';

export const DEFAULT_MINIGAME_FREQUENCY = { min: 2, max: 3 } satisfies Exclude<
  MinigameFrequencyRange,
  'off'
>;

/** One card between quizzes is the tightest the stream can be; zero used to be
 * offered and was silently read as one everywhere it mattered. */
export const MINIGAME_FREQUENCY_MIN = 1;
/**
 * The default still breaks study methods, especially typing, up by a quiz every
 * two or three cards. That pacing is where the setting starts, not where it
 * stops: capping the scale at three left the slider four positions wide, and in
 * a review block of a handful of cards both ends produced the same one or two
 * quizzes, so the control looked inert. Eight is far enough out that moving the
 * handle is visible in an ordinary block.
 */
export const MINIGAME_FREQUENCY_MAX = 8;

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  level?: GameDifficultyLevel;
  difficultyBand?: SimilarityBand;
  /** SRS stage of the word used as this round's prompt. */
  stageIndex?: number;
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
  difficultyBand?: SimilarityBand;
  /** SRS stage of the word used as this round's prompt. */
  stageIndex?: number;
  words: NormalizedWord[];
  anchorOriginalIndex: number;
}
