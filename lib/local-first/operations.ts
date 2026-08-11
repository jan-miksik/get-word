import type {
  SyncMutationPayload,
  SyncProgressItem,
  SyncReviewEventItem,
} from '@/features/sync/types';

interface ProgressOperation {
  entity: 'progress';
  opType: 'upsert';
  payload: SyncProgressItem;
}

interface MemoryHookOperation {
  entity: 'memory_hook';
  opType: 'set';
  payload: { id: string; text: string | null };
}

interface PreferenceOperation {
  entity: 'preference';
  opType: 'set' | 'set_language_pair';
  payload: {
    field?: keyof SyncMutationPayload;
    value?: unknown;
    values?: Partial<SyncMutationPayload>;
    baseRevision?: number;
  };
}

interface CategoryFiltersOperation {
  entity: 'category_filters';
  opType: 'replace';
  payload: { filters: string[] };
}

interface GameScoreOperation {
  entity: 'game_score';
  opType: 'max';
  payload: { score: number };
}

interface ReviewEventOperation {
  entity: 'review_event';
  opType: 'event';
  payload: SyncReviewEventItem;
}

export type OutboxOperation =
  | ProgressOperation
  | MemoryHookOperation
  | PreferenceOperation
  | CategoryFiltersOperation
  | GameScoreOperation
  | ReviewEventOperation;
