import type { MiniGameConfig } from '@/features/learning/minigames';
import type { SessionBlockKind } from './session/blocks';
import type { NormalizedWord } from '@/lib/words';

type LearningStreamGroupKind = SessionBlockKind | 'settling';
export type LearningStreamItem = NormalizedWord | MiniGameConfig;

/** A live, currently available projection of a frozen session block. */
export interface LearningStreamBlock {
  key: string;
  kind: LearningStreamGroupKind;
  blockIndex: number;
  /** Successful answers confirm the current stage instead of advancing it. */
  reinforcement?: true;
  words: NormalizedWord[];
}

export interface LearningStreamGroup {
  key: string;
  kind: LearningStreamGroupKind;
  blockIndex: number;
  reinforcement?: true;
  items: LearningStreamItem[];
}
