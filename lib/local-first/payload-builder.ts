'use client';

import type {
  SyncMutationPayload,
  SyncProgressItem,
  SyncReviewEventItem,
} from '@/features/sync/types';
import type { OutboxOp } from './outbox';

export interface BuiltPayload {
  payload: SyncMutationPayload & { client_op_ids: string[] };
  clientOpIds: string[];
}

interface ProgressOpPayload {
  word_id?: string;
  word_list_item_id?: string;
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
  client_updated_at?: number;
}

interface MemoryHookOpPayload {
  id: string;
  text: string | null;
}

interface PreferenceOpPayload {
  field?: keyof SyncMutationPayload;
  value?: unknown;
  /** Several preferences that must reach the server atomically. */
  values?: Partial<SyncMutationPayload>;
}

interface CategoryFiltersOpPayload {
  filters: string[];
}

interface GameScoreOpPayload {
  score: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildPayloadFromOps(ops: OutboxOp[]): BuiltPayload | null {
  if (ops.length === 0) return null;

  const payload: SyncMutationPayload & { client_op_ids: string[] } = {
    client_op_ids: [],
  };

  const progressByKey = new Map<string, SyncProgressItem>();
  const memoryHooks: Record<string, string | null> = {};
  const reviewEventsByClientId = new Map<string, SyncReviewEventItem>();
  let maxGameScore: number | null = null;
  let lastCategoryFilters: string[] | null = null;

  for (const op of ops) {
    payload.client_op_ids.push(op.clientOpId);
    switch (op.entity) {
      case 'progress':
        applyProgressOp(progressByKey, op);
        break;
      case 'memory_hook':
        applyMemoryHookOp(memoryHooks, op);
        break;
      case 'preference':
        applyPreferenceOp(payload, op);
        break;
      case 'category_filters': {
        const p = op.payload as CategoryFiltersOpPayload | undefined;
        if (p && Array.isArray(p.filters)) lastCategoryFilters = p.filters.slice();
        break;
      }
      case 'game_score': {
        const p = op.payload as GameScoreOpPayload | undefined;
        if (p && typeof p.score === 'number') {
          maxGameScore = maxGameScore === null ? p.score : Math.max(maxGameScore, p.score);
        }
        break;
      }
      case 'review_event':
        applyReviewEventOp(reviewEventsByClientId, op);
        break;
    }
  }

  if (progressByKey.size > 0) {
    payload.progress = Array.from(progressByKey.values());
  }
  if (Object.keys(memoryHooks).length > 0) {
    payload.memory_hooks = memoryHooks;
  }
  if (lastCategoryFilters !== null) {
    payload.category_filters = lastCategoryFilters;
  }
  if (maxGameScore !== null) {
    payload.game_score = maxGameScore;
  }
  if (reviewEventsByClientId.size > 0) {
    payload.review_events = Array.from(reviewEventsByClientId.values());
  }

  return { payload, clientOpIds: payload.client_op_ids };
}

function applyProgressOp(
  bucket: Map<string, SyncProgressItem>,
  op: OutboxOp
): void {
  if (!isObject(op.payload)) return;
  const p = op.payload as Partial<ProgressOpPayload>;
  const key = p.word_list_item_id ?? p.word_id;
  if (!key) return;
  if (typeof p.stage_index !== 'number') return;
  bucket.set(key, {
    ...(p.word_list_item_id ? { word_list_item_id: p.word_list_item_id } : {}),
    ...(p.word_id && !p.word_list_item_id ? { word_id: p.word_id } : {}),
    stage_index: p.stage_index,
    known_count: p.known_count ?? 0,
    unknown_count: p.unknown_count ?? 0,
    last_known_at: p.last_known_at ?? null,
    last_unknown_at: p.last_unknown_at ?? null,
    next_due_at: p.next_due_at ?? null,
    // Pass through so server-side LWW can arbitrate against the row's
    // existing updatedAt. Coalescing on `key` already keeps the last op's
    // timestamp, which is the freshest user intent for that word.
    ...(typeof p.client_updated_at === 'number' ? { client_updated_at: p.client_updated_at } : {}),
  });
}

function applyMemoryHookOp(
  bucket: Record<string, string | null>,
  op: OutboxOp
): void {
  if (!isObject(op.payload)) return;
  const p = op.payload as Partial<MemoryHookOpPayload>;
  if (typeof p.id !== 'string' || p.id.length === 0) return;
  bucket[p.id] = p.text ?? null;
}

function applyReviewEventOp(
  bucket: Map<string, SyncReviewEventItem>,
  op: OutboxOp
): void {
  if (!isObject(op.payload)) return;
  const p = op.payload as Partial<SyncReviewEventItem>;
  if (typeof p.client_event_id !== 'string' || p.client_event_id.length === 0) return;
  if (p.action !== 'known' && p.action !== 'really_known' && p.action !== 'unknown') return;
  if (typeof p.client_created_at !== 'number') return;
  if (typeof p.word_id !== 'string' && typeof p.word_list_item_id !== 'string') return;
  bucket.set(p.client_event_id, {
    client_event_id: p.client_event_id,
    ...(p.word_list_item_id ? { word_list_item_id: p.word_list_item_id } : {}),
    ...(p.word_id && !p.word_list_item_id ? { word_id: p.word_id } : {}),
    action: p.action,
    client_created_at: p.client_created_at,
  });
}

function applyPreferenceOp(
  payload: SyncMutationPayload & { client_op_ids: string[] },
  op: OutboxOp
): void {
  if (!isObject(op.payload)) return;
  const p = op.payload as Partial<PreferenceOpPayload>;
  if (isObject(p.values)) {
    Object.assign(payload, p.values);
    return;
  }
  if (typeof p.field !== 'string') return;
  // Trust caller-typed shape; this is a controlled internal API.
  (payload as Record<string, unknown>)[p.field] = p.value;
}
