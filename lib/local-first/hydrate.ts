'use client';

import type { SyncResponse } from '@/lib/sync';
import type { SyncReviewEventItem } from '@/features/sync/types';
import { getSnapshot } from '@/lib/local-learning-cache';
import { STAGES } from '@/lib/words';
import { ensureLocalFirstAvailability } from './availability';
import { META_SCHEMA_VERSION } from './db';
import { listOps, type OutboxOp } from './outbox';
import {
  getAllMemoryHookRows,
  getAllProgressRows,
  getCategoryFilterRow,
  getMeta,
  getPrefsRow,
  putCategoryFilterRow,
  putMemoryHookRow,
  putMeta,
  putPrefsRow,
  putProgressRow,
} from './stores';

type ProgressEntry = SyncResponse['progress'][string];
type SyncUser = SyncResponse['user'];

type PendingPreferencePayload = {
  field?: string;
  value?: unknown;
};

type PendingProgressPayload = {
  word_id?: string;
  word_list_item_id?: string;
  stage_index?: number;
  known_count?: number;
  unknown_count?: number;
  last_known_at?: number | null;
  last_unknown_at?: number | null;
  next_due_at?: number | null;
  client_updated_at?: number;
};

type PendingReviewEventPayload = SyncReviewEventItem;

export interface IdbHydration {
  syncResponse: SyncResponse;
  activeListId: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toIso(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

function pendingOpsInApplyOrder(ops: OutboxOp[]): OutboxOp[] {
  return ops.slice().sort((a, b) => {
    const tsCompare = a.clientCreatedAt.localeCompare(b.clientCreatedAt);
    if (tsCompare !== 0) return tsCompare;
    return a.clientOpId.localeCompare(b.clientOpId);
  });
}

function ensureProgress(data: SyncResponse): SyncResponse['progress'] {
  return data.progress ?? ({} as SyncResponse['progress']);
}

function applyPendingProgress(
  data: SyncResponse,
  payload: PendingProgressPayload,
  op: OutboxOp
): void {
  const key = payload.word_list_item_id ?? payload.word_id;
  if (!key || typeof payload.stage_index !== 'number') return;

  const progress = ensureProgress(data);
  const existing = progress[key];
  const updatedAt =
    typeof payload.client_updated_at === 'number'
      ? new Date(payload.client_updated_at).toISOString()
      : op.clientCreatedAt;

  progress[key] = {
    id: existing?.id ?? key,
    userId: existing?.userId ?? data.user.id,
    wordId: payload.word_list_item_id ? null : (payload.word_id ?? existing?.wordId ?? null),
    wordListItemId: payload.word_list_item_id ?? existing?.wordListItemId ?? null,
    stageIndex: payload.stage_index,
    knownCount: payload.known_count ?? existing?.knownCount ?? 0,
    unknownCount: payload.unknown_count ?? existing?.unknownCount ?? 0,
    lastKnownAt: toIso(payload.last_known_at),
    lastUnknownAt: toIso(payload.last_unknown_at),
    nextDueAt: toIso(payload.next_due_at),
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  };
  data.progress = progress;
}

function applyPendingPreference(
  user: SyncUser,
  payload: PendingPreferencePayload,
  op: OutboxOp
): void {
  switch (payload.field) {
    case 'role':
      if (payload.value === 'knownLanguage' || payload.value === 'languageToLearn') {
        user.role = payload.value;
      }
      break;
    case 'show_english':
      if (typeof payload.value === 'boolean') user.show_english = payload.value;
      break;
    case 'show_category_badges':
      if (typeof payload.value === 'boolean') user.show_category_badges = payload.value;
      break;
    case 'show_pronunciation':
      if (typeof payload.value === 'boolean') user.show_pronunciation = payload.value;
      break;
    case 'memory_hooks_enabled':
      if (typeof payload.value === 'boolean') user.memory_hooks_enabled = payload.value;
      break;
    case 'memory_hooks_intro_answered':
      if (typeof payload.value === 'boolean') user.memory_hooks_intro_answered = payload.value;
      break;
    case 'memory_hook_disable_from_stage':
      if (typeof payload.value === 'number') user.memory_hook_disable_from_stage = payload.value;
      break;
    case 'settings_language':
      if (typeof payload.value === 'string') {
        user.settings_language = payload.value;
        user.settings_language_selected_at = op.clientCreatedAt;
      }
      break;
    case 'language_from':
      if (typeof payload.value === 'string' || payload.value === null) {
        user.language_from = payload.value;
      }
      break;
    case 'language_to':
      if (typeof payload.value === 'string' || payload.value === null) {
        user.language_to = payload.value;
      }
      break;
    case 'onboarding_completed':
      if (typeof payload.value === 'boolean') {
        user.onboarding_completed_at = payload.value ? op.clientCreatedAt : null;
      }
      break;
    case 'category_order':
      if (Array.isArray(payload.value)) {
        user.category_order = payload.value.filter((item): item is string => typeof item === 'string');
      }
      break;
  }
}

function hasReviewEventAlreadyApplied(
  existing: SyncResponse['progress'][string] | undefined,
  event: PendingReviewEventPayload
): boolean {
  if (!existing) return false;
  const occurredAt = event.client_created_at;
  const relevantAt =
    event.action === 'unknown' ? existing.lastUnknownAt : existing.lastKnownAt;
  const relevantMs = relevantAt ? new Date(relevantAt).getTime() : 0;
  return Number.isFinite(relevantMs) && relevantMs >= occurredAt;
}

function applyPendingReviewEvent(
  data: SyncResponse,
  event: PendingReviewEventPayload,
  fallbackCreatedAt: string,
  progressWriteAtByKey: Map<string, number>
): void {
  const key = event.word_list_item_id ?? event.word_id;
  if (!key) return;
  if (
    event.action !== 'known' &&
    event.action !== 'really_known' &&
    event.action !== 'unknown'
  ) {
    return;
  }
  if (typeof event.client_created_at !== 'number') return;

  const progress = ensureProgress(data);
  const existing = progress[key];
  const overridingProgressWriteAt = progressWriteAtByKey.get(key) ?? 0;
  if (overridingProgressWriteAt >= event.client_created_at) return;
  if (hasReviewEventAlreadyApplied(existing, event)) return;

  const currentStageIndex = existing?.stageIndex ?? 0;
  const nextStageIndex =
    event.action === 'known'
      ? Math.min(currentStageIndex + 1, STAGES.length - 1)
      : event.action === 'really_known'
        ? Math.min(currentStageIndex + 2, STAGES.length - 1)
        : Math.max(currentStageIndex - 1, 0);
  const occurredAt = new Date(event.client_created_at).toISOString();
  const stage = STAGES[nextStageIndex];
  const nextDueAt =
    stage.intervalMs > 0
      ? new Date(event.client_created_at + stage.intervalMs).toISOString()
      : null;

  progress[key] = {
    id: existing?.id ?? key,
    userId: existing?.userId ?? data.user.id,
    wordId: event.word_list_item_id ? null : (event.word_id ?? existing?.wordId ?? null),
    wordListItemId: event.word_list_item_id ?? existing?.wordListItemId ?? null,
    stageIndex: nextStageIndex,
    knownCount:
      event.action === 'unknown'
        ? existing?.knownCount ?? 0
        : (existing?.knownCount ?? 0) + 1,
    unknownCount:
      event.action === 'unknown'
        ? (existing?.unknownCount ?? 0) + 1
        : existing?.unknownCount ?? 0,
    lastKnownAt: event.action === 'unknown' ? existing?.lastKnownAt ?? null : occurredAt,
    lastUnknownAt: event.action === 'unknown' ? occurredAt : existing?.lastUnknownAt ?? null,
    nextDueAt,
    createdAt: existing?.createdAt ?? fallbackCreatedAt,
    updatedAt: occurredAt,
  };
  data.progress = progress;
}

function cloneSyncResponse(data: SyncResponse): SyncResponse {
  return {
    ...data,
    user: { ...data.user },
    progress: data.progress ? { ...data.progress } : ({} as SyncResponse['progress']),
    memory_hooks: data.memory_hooks ? { ...data.memory_hooks } : {},
    category_filters: data.category_filters ? [...data.category_filters] : [],
  };
}

export async function applyPendingOutboxToSyncResponse(
  data: SyncResponse,
  submittedReviewEvents: SyncReviewEventItem[] = []
): Promise<SyncResponse> {
  const available = await ensureLocalFirstAvailability();
  const ops = available ? pendingOpsInApplyOrder(await listOps()) : [];
  if (ops.length === 0 && submittedReviewEvents.length === 0) return data;

  const next = cloneSyncResponse(data);
  const reviewEventsById = new Map<string, { event: SyncReviewEventItem; fallbackCreatedAt: string }>();
  const progressWriteAtByKey = new Map<string, number>();
  for (const event of submittedReviewEvents) {
    reviewEventsById.set(event.client_event_id, {
      event,
      fallbackCreatedAt: new Date(event.client_created_at).toISOString(),
    });
  }
  for (const op of ops) {
    if (!isObject(op.payload)) continue;
    switch (op.entity) {
      case 'progress': {
        const payload = op.payload as PendingProgressPayload;
        applyPendingProgress(next, payload, op);
        const key = payload.word_list_item_id ?? payload.word_id;
        const writeAt =
          typeof payload.client_updated_at === 'number'
            ? payload.client_updated_at
            : new Date(op.clientCreatedAt).getTime();
        if (key && Number.isFinite(writeAt)) {
          progressWriteAtByKey.set(key, Math.max(progressWriteAtByKey.get(key) ?? 0, writeAt));
        }
        break;
      }
      case 'review_event': {
        const event = op.payload as Partial<SyncReviewEventItem>;
        if (typeof event.client_event_id === 'string') {
          reviewEventsById.set(event.client_event_id, {
            event: event as SyncReviewEventItem,
            fallbackCreatedAt: op.clientCreatedAt,
          });
        }
        break;
      }
      case 'preference':
        applyPendingPreference(next.user, op.payload as PendingPreferencePayload, op);
        break;
      case 'memory_hook': {
        const id = typeof op.payload.id === 'string' ? op.payload.id : null;
        if (!id) break;
        const text = typeof op.payload.text === 'string' ? op.payload.text : null;
        if (text === null) delete next.memory_hooks[id];
        else next.memory_hooks[id] = text;
        break;
      }
      case 'category_filters':
        if (Array.isArray(op.payload.filters)) {
          next.category_filters = op.payload.filters.filter(
            (item): item is string => typeof item === 'string'
          );
        }
        break;
      case 'game_score':
        if (typeof op.payload.score === 'number') {
          next.user.game_score = Math.max(next.user.game_score ?? 0, op.payload.score);
        }
        break;
    }
  }
  for (const { event, fallbackCreatedAt } of reviewEventsById.values()) {
    applyPendingReviewEvent(next, event, fallbackCreatedAt, progressWriteAtByKey);
  }

  return next;
}

/**
 * Read every domain row written by past server snapshots and reassemble a
 * SyncResponse-shaped object that applyServerData can consume directly. The
 * legacy snapshot (kept for compatibility) supplies word_list_items,
 * categories, lists, and sync_revision since those have no per-domain store.
 *
 * Returns null when local-first is unavailable, the schema doesn't match, or
 * there's not enough data to be worth a warm apply.
 */
export async function loadAllDomainsFromIdb(): Promise<IdbHydration | null> {
  const available = await ensureLocalFirstAvailability();
  if (!available) return null;

  const meta = await getMeta();
  if (!meta || meta.schemaVersion !== META_SCHEMA_VERSION) return null;

  const [progressRows, memoryRows, categoryRow, prefsRow, snapshot] = await Promise.all([
    getAllProgressRows<ProgressEntry>(),
    getAllMemoryHookRows<string>(),
    getCategoryFilterRow<string[]>('all'),
    getPrefsRow<SyncUser>('user'),
    getSnapshot().catch(() => null),
  ]);

  const user = prefsRow?.value ?? snapshot?.data.user;
  if (!user) return null;

  const progress: SyncResponse['progress'] = {};
  for (const { key, row } of progressRows) {
    if (row.deletedAt || !row.value) continue;
    progress[key] = row.value;
  }
  if (progressRows.length === 0 && snapshot?.data.progress) {
    const fallback = snapshot.data.progress as SyncResponse['progress'];
    for (const [key, value] of Object.entries(fallback)) progress[key] = value;
  }

  const memory_hooks: Record<string, string> = {};
  for (const { key, row } of memoryRows) {
    if (row.deletedAt) continue;
    if (typeof row.value === 'string') memory_hooks[key] = row.value;
  }
  if (memoryRows.length === 0 && snapshot?.data.memory_hooks) {
    const fallback = snapshot.data.memory_hooks as Record<string, string>;
    for (const [key, value] of Object.entries(fallback)) {
      if (typeof value === 'string') memory_hooks[key] = value;
    }
  }

  const filtersFromIdb = Array.isArray(categoryRow?.value) ? categoryRow!.value : null;
  const filtersFromSnapshot = Array.isArray(snapshot?.data.category_filters)
    ? (snapshot!.data.category_filters as string[])
    : null;
  const category_filters = filtersFromIdb ?? filtersFromSnapshot ?? [];

  const syncResponse: SyncResponse = {
    success: true,
    user,
    progress,
    memory_hooks,
    category_filters,
    word_list_items: snapshot?.data.word_list_items as SyncResponse['word_list_items'],
    categories: snapshot?.data.categories as SyncResponse['categories'],
    lists: snapshot?.data.lists as SyncResponse['lists'],
    sync_revision:
      typeof snapshot?.data.sync_revision === 'number'
        ? snapshot.data.sync_revision
        : undefined,
  };

  return {
    syncResponse: await applyPendingOutboxToSyncResponse(syncResponse).catch(() => syncResponse),
    activeListId: snapshot?.activeListId ?? null,
  };
}

/**
 * Best-effort write-through: mirror the server snapshot into per-domain rows
 * so a tab close mid-hydration still leaves a coherent warm-load source.
 * Caller decides whether to await; failures are swallowed.
 */
export async function persistDomainsToIdb(data: SyncResponse): Promise<void> {
  const available = await ensureLocalFirstAvailability();
  if (!available) return;

  const writes: Promise<unknown>[] = [];

  if (data.progress) {
    for (const [id, entry] of Object.entries(data.progress)) {
      writes.push(
        putProgressRow(id, entry, { updatedAt: entry?.updatedAt }).catch(() => false)
      );
    }
  }

  if (data.memory_hooks) {
    for (const [id, text] of Object.entries(data.memory_hooks)) {
      writes.push(putMemoryHookRow(id, text).catch(() => false));
    }
  }

  if (Array.isArray(data.category_filters)) {
    writes.push(putCategoryFilterRow('all', data.category_filters).catch(() => false));
  }

  if (data.user) {
    writes.push(putPrefsRow('user', data.user).catch(() => false));
  }

  writes.push(putMeta({ schemaVersion: META_SCHEMA_VERSION }).catch(() => false));

  await Promise.all(writes);
}
