import type {
  SyncActivitySegment,
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
  opType: 'set' | 'set_language_pair' | 'set_study_goal';
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

interface SurveyCounterOperation {
  entity: 'survey_counter';
  opType: 'max';
  payload: { count: number };
}

/**
 * `choice`/`freeText` are both null for a dismissal, matching the server's
 * discriminated-union contract (SyncMutationPayloadSchema's survey_responses
 * entry) — a response is either an answer or a dismissal, never a mix.
 */
interface SurveyResponseOperation {
  entity: 'survey_response';
  opType: 'set';
  payload: { surveyId: string; choice: string | null; freeText: string | null; dismissed: boolean };
}

interface ReviewEventOperation {
  entity: 'review_event';
  opType: 'event';
  payload: SyncReviewEventItem;
}

/**
 * `owner` is the auth subject the segment was measured under. Sign-out normally
 * destroys the whole outbox database, but that delete resolves without effect
 * when another tab holds the connection open, so a segment can outlive the
 * account it belongs to. The drainer drops non-matching owners rather than
 * posting one person's activity under another's id.
 */
interface ActivitySegmentOperation {
  entity: 'activity_segment';
  opType: 'event';
  payload: SyncActivitySegment & { owner?: string | null };
}

export type OutboxOperation =
  | ProgressOperation
  | MemoryHookOperation
  | PreferenceOperation
  | CategoryFiltersOperation
  | GameScoreOperation
  | SurveyCounterOperation
  | SurveyResponseOperation
  | ReviewEventOperation
  | ActivitySegmentOperation;
