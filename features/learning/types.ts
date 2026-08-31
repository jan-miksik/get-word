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
  /** Same-session check: uses the gentler reinforcement exercise presentation. */
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
