'use client';

import type {
  SyncActivitySegment,
  SyncMutationPayload,
  SyncProgressItem,
  SyncReviewEventItem,
} from '@/features/sync/types';
import type { OutboxOp } from './outbox';

export interface BuiltPayload {
  payload: SyncMutationPayload & { client_op_ids: string[] };
  clientOpIds: string[];
  invalidClientOpIds: string[];
  /**
   * Ops that are well-formed but must not be sent — currently activity
   * measured under a different account. Callers delete these silently rather
   * than flagging them for recovery like `invalidClientOpIds`.
   */
  discardedClientOpIds: string[];
}

export interface BuildPayloadOptions {
  /** Auth subject the flush will be attributed to, or null when signed out. */
  owner?: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildPayloadFromOps(
  ops: OutboxOp[],
  options: BuildPayloadOptions = {}
): BuiltPayload | null {
  if (ops.length === 0) return null;

  const payload: SyncMutationPayload & { client_op_ids: string[] } = {
    client_op_ids: [],
  };

  const progressByKey = new Map<string, SyncProgressItem>();
  const memoryHooks: Record<string, string | null> = {};
  const reviewEventsByClientId = new Map<string, SyncReviewEventItem>();
  const activitySegmentsByClientId = new Map<string, SyncActivitySegment>();
  const invalidClientOpIds: string[] = [];
  const discardedClientOpIds: string[] = [];
  let maxGameScore: number | null = null;
  let lastCategoryFilters: string[] | null = null;

  for (const op of ops) {
    let accepted = false;
    switch (op.entity) {
      case 'progress':
        accepted = applyProgressOp(progressByKey, op);
        break;
      case 'memory_hook':
        accepted = applyMemoryHookOp(memoryHooks, op);
        break;
      case 'preference':
        accepted = applyPreferenceOp(payload, op);
        break;
      case 'category_filters': {
        const p = op.payload;
        if (p && Array.isArray(p.filters) && p.filters.every((value) => typeof value === 'string')) {
          lastCategoryFilters = p.filters.slice();
          accepted = true;
        }
        break;
      }
      case 'game_score': {
        const p = op.payload;
        if (p && typeof p.score === 'number') {
          maxGameScore = maxGameScore === null ? p.score : Math.max(maxGameScore, p.score);
          accepted = true;
        }
        break;
      }
      case 'review_event':
        accepted = applyReviewEventOp(reviewEventsByClientId, op);
        break;
      case 'activity_segment': {
        // Activity is the one entity that carries its own owner, because a
        // segment posted under the wrong account is silently wrong data rather
        // than a visible failure.
        const segmentOwner = isObject(op.payload) ? op.payload.owner : undefined;
        if (segmentOwner !== undefined && segmentOwner !== (options.owner ?? null)) {
          discardedClientOpIds.push(op.clientOpId);
          continue;
        }
        accepted = applyActivitySegmentOp(activitySegmentsByClientId, op);
        break;
      }
    }
    if (accepted) payload.client_op_ids.push(op.clientOpId);
    else invalidClientOpIds.push(op.clientOpId);
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
  if (activitySegmentsByClientId.size > 0) {
    payload.activity_segments = Array.from(activitySegmentsByClientId.values());
  }

  return {
    payload,
    clientOpIds: payload.client_op_ids,
    invalidClientOpIds,
    discardedClientOpIds,
  };
}

function applyProgressOp(
  bucket: Map<string, SyncProgressItem>,
  op: Extract<OutboxOp, { entity: 'progress' }>
): boolean {
  if (!isObject(op.payload)) return false;
  const p = op.payload;
  const key = p.word_list_item_id ?? p.word_id;
  if (typeof key !== 'string' || !key) return false;
  if (typeof p.stage_index !== 'number') return false;
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
  return true;
}

function applyMemoryHookOp(
  bucket: Record<string, string | null>,
  op: Extract<OutboxOp, { entity: 'memory_hook' }>
): boolean {
  if (!isObject(op.payload)) return false;
  const p = op.payload;
  if (typeof p.id !== 'string' || p.id.length === 0) return false;
  if (typeof p.text !== 'string' && p.text !== null) return false;
  bucket[p.id] = p.text ?? null;
  return true;
}

function applyReviewEventOp(
  bucket: Map<string, SyncReviewEventItem>,
  op: Extract<OutboxOp, { entity: 'review_event' }>
): boolean {
  if (!isObject(op.payload)) return false;
  const p = op.payload as Partial<SyncReviewEventItem>;
  if (typeof p.client_event_id !== 'string' || p.client_event_id.length === 0) return false;
  if (p.action !== 'known' && p.action !== 'really_known' && p.action !== 'unknown') return false;
  if (typeof p.client_created_at !== 'number') return false;
  if (typeof p.word_id !== 'string' && typeof p.word_list_item_id !== 'string') return false;
  bucket.set(p.client_event_id, {
    client_event_id: p.client_event_id,
    ...(p.word_list_item_id ? { word_list_item_id: p.word_list_item_id } : {}),
    ...(p.word_id && !p.word_list_item_id ? { word_id: p.word_id } : {}),
    action: p.action,
    client_created_at: p.client_created_at,
  });
  return true;
}

function applyActivitySegmentOp(
  bucket: Map<string, SyncActivitySegment>,
  op: Extract<OutboxOp, { entity: 'activity_segment' }>
): boolean {
  if (!isObject(op.payload)) return false;
  const p = op.payload as Partial<SyncActivitySegment>;
  if (typeof p.client_segment_id !== 'string' || p.client_segment_id.length === 0) return false;
  if (typeof p.session_id !== 'string' || p.session_id.length === 0) return false;
  if (typeof p.surface !== 'string') return false;
  if (typeof p.started_at !== 'number' || typeof p.ended_at !== 'number') return false;
  if (typeof p.active_ms !== 'number' || p.active_ms < 0) return false;
  if (p.ended_at < p.started_at) return false;
  // Segments are immutable once closed, so a repeat of the same id is a
  // redelivery rather than an update — keeping either copy is equivalent.
  bucket.set(p.client_segment_id, {
    client_segment_id: p.client_segment_id,
    session_id: p.session_id,
    surface: p.surface,
    started_at: p.started_at,
    ended_at: p.ended_at,
    active_ms: p.active_ms,
    ...(typeof p.interactions === 'number' ? { interactions: p.interactions } : {}),
  });
  return true;
}

const PREFERENCE_FIELDS = new Set<keyof SyncMutationPayload>([
  'show_english',
  'show_category_badges',
  'show_pronunciation',
  'memory_hooks_enabled',
  'memory_hooks_intro_answered',
  'memory_hook_disable_from_stage',
  'study_notes_enabled',
  'study_note_minimize_from_stage',
  'settings_language',
  'language_from',
  'language_to',
  'onboarding_completed',
  'category_order',
  'settings_language_selected_at',
  'language_pair_selected_at',
  'settings_language_base_revision',
  'language_pair_base_revision',
]);

function applyPreferenceOp(
  payload: SyncMutationPayload & { client_op_ids: string[] },
  op: Extract<OutboxOp, { entity: 'preference' }>
): boolean {
  if (!isObject(op.payload)) return false;
  const p = op.payload;
  if (isObject(p.values)) {
    const entries = Object.entries(p.values).filter(([field]) => PREFERENCE_FIELDS.has(field));
    if (entries.length === 0 || entries.length !== Object.keys(p.values).length) return false;
    Object.assign(payload, Object.fromEntries(entries));
    if (typeof p.baseRevision === 'number') {
      if (entries.some(([field]) => field === 'settings_language')) {
        payload.settings_language_base_revision = p.baseRevision;
      }
      if (entries.some(([field]) =>
        field === 'language_from' || field === 'language_to' || field === 'onboarding_completed'
      )) {
        payload.language_pair_base_revision = p.baseRevision;
      }
    }
    stampLanguageChoiceTime(payload, entries.map(([field]) => field), op);
    return true;
  }
  if (typeof p.field !== 'string' || !PREFERENCE_FIELDS.has(p.field)) return false;
  (payload as Record<string, unknown>)[p.field] = p.value;
  if (p.field === 'settings_language' && typeof p.baseRevision === 'number') {
    payload.settings_language_base_revision = p.baseRevision;
  }
  stampLanguageChoiceTime(payload, [p.field], op);
  return true;
}

/**
 * Carry the moment the op was enqueued alongside the language fields it sets.
 * The outbox is durable across sessions and devices, so arrival order says
 * nothing about intent: without this the server would let an op queued offline
 * days ago overwrite a language the learner has since picked elsewhere. Ops are
 * applied oldest-first, so the last write for a field also leaves the newest
 * timestamp here.
 */
function stampLanguageChoiceTime(
  payload: SyncMutationPayload & { client_op_ids: string[] },
  fields: string[],
  op: OutboxOp
): void {
  const chosenAt = new Date(op.clientCreatedAt).getTime();
  if (!Number.isFinite(chosenAt)) return;
  if (fields.includes('settings_language')) {
    payload.settings_language_selected_at = chosenAt;
  }
  if (
    fields.includes('language_from') ||
    fields.includes('language_to') ||
    fields.includes('onboarding_completed')
  ) {
    payload.language_pair_selected_at = chosenAt;
  }
}
