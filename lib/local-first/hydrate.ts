'use client';

import type { SyncResponse } from '@/lib/sync';
import { getSnapshot } from '@/lib/local-learning-cache';
import { ensureLocalFirstAvailability } from './availability';
import { META_SCHEMA_VERSION } from './db';
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

export interface IdbHydration {
  syncResponse: SyncResponse;
  activeListId: string | null;
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
    syncResponse,
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
