export {
  alternativesAreSlotCompatible,
  getAcceptedAnswerCandidates,
  matchAnswer,
  matchAnswerAgainstCandidates,
  requiresExplicitTypingCheck,
} from './answer-match';
export {
  persistMinigameFrequency,
  readStoredMinigameFrequency,
} from './frequency';
export { computeGameAnchors } from './anchors';
export { hasAtLeastOneSimilarPair, pickThinPoolWords } from './similarity';
export { shuffleGameItems } from './shuffle';
export {
  composeStream,
  enforceMinigameMinGap,
  injectMinigames,
  pruneAnchorsForCurrentSize,
} from './stream';
export type {
  GameAnchor,
  GameType,
  InjectMinigamesOptions,
  MiniGameConfig,
  MinigameFrequencyRange,
} from './types';
export {
  DEFAULT_MINIGAME_FREQUENCY,
  MINIGAME_FREQUENCY_MAX,
  MINIGAME_FREQUENCY_MIN,
} from './types';
