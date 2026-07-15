export {
  alternativesAreSlotCompatible,
  getAcceptedAnswerCandidates,
  matchAnswer,
  matchAnswerAgainstCandidates,
  requiresExplicitTypingCheck,
} from './answer-match';
export type { AnswerCandidate, AnswerMatchResult } from './answer-match';
export {
  persistMinigameFrequency,
  readStoredMinigameFrequency,
  sanitizeMinigameFrequency,
} from './frequency';
export { computeGameAnchors } from './anchors';
export { hasAtLeastOneSimilarPair } from './similarity';
export {
  composeStream,
  enforceMinigameMinGap,
  injectMinigames,
  pruneAnchorsForCurrentSize,
} from './stream';
export type {
  GameAnchor,
  GameDifficultyLevel,
  GameType,
  InjectMinigamesOptions,
  MiniGameConfig,
  MinigameFrequencyRange,
  StreamItem,
} from './types';
export {
  DEFAULT_MINIGAME_FREQUENCY,
  MINIGAME_FREQUENCY_MAX,
  MINIGAME_FREQUENCY_MIN,
} from './types';
