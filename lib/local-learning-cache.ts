'use client';

import type { SyncResponse } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';
import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { reportAudioStorageResponse } from '@/lib/audio-debug';
import {
  canBulkCacheAudio,
  isAudioNetworkOffline,
  subscribeAudioNetworkChanges,
} from '@/lib/audio-network-policy';
import { DB_NAME, STORE_KV, openDb as openSharedDb } from '@/lib/local-first/db';

const STORE_NAME = STORE_KV;
const STORAGE_PREF_KEY = 'get-word-local-learning-cache-enabled';
const AUDIO_PREF_KEY = 'get-word-active-list-audio-cache-enabled';
const AUDIO_CACHE_NAME = 'get-word-active-list-audio-v1';
/**
 * On metered/unknown connections we still cache audio, but only up to this
 * budget — so short lists are always available offline while large lists never
 * silently spend cellular data. Unmetered connections cache the whole list.
 */
const SMALL_LIST_AUDIO_BUDGET_BYTES = 10 * 1024 * 1024;
/**
 * Max audio downloads in flight when pre-warming the whole list on an unmetered
 * connection. Browsers cap ~6 connections per origin on HTTP/1.1, so going
 * higher buys little while risking gateway rate limits.
 */
const AUDIO_CACHE_CONCURRENCY = 6;
let activeAudioCacheController: AbortController | null = null;

export interface LearningSnapshot {
  savedAt: number;
  activeListId: string | null;
  data: Pick<
    SyncResponse,
    'user' | 'progress' | 'memory_hooks' | 'category_filters' | 'word_list_items' | 'categories' | 'lists' | 'sync_revision'
  >;
}

export interface AudioCacheStatus {
  supported: boolean;
  enabled: boolean;
  cachedCount: number;
  cachedSizeBytes: number;
  lastCachedAt: number | null;
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredBooleanPreference(key: string): boolean | null {
  if (!storageAvailable()) return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === '1') return true;
    if (value === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function writeBooleanPreference(key: string, value: boolean): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Preference persistence is best-effort; the app remains usable without it.
  }
}

export function getStoragePreference(): boolean {
  return true;
}

export function setStoragePreference(enabled: boolean): void {
  writeBooleanPreference(STORAGE_PREF_KEY, enabled);
}

function getDefaultAudioCachePreference(): boolean {
  // Whole-list audio caching is on by default. The network policy keeps
  // metered/unknown connections within a small-list budget, while unmetered
  // connections warm the whole active list for offline study.
  return true;
}

export function getAudioCachePreference(): boolean {
  return readStoredBooleanPreference(AUDIO_PREF_KEY) ?? getDefaultAudioCachePreference();
}

export function setAudioCachePreference(enabled: boolean): void {
  writeBooleanPreference(AUDIO_PREF_KEY, enabled);
  notifyAudioCachePreference(enabled);
}

function notifyAudioCachePreference(enabled: boolean): void {
  if (typeof navigator === 'undefined') return;
  navigator.serviceWorker?.controller?.postMessage({
    type: 'GET_WORD_AUDIO_CACHE_PREFERENCE',
    enabled,
  });
}

function openDb(): Promise<IDBDatabase | null> {
  return openSharedDb();
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      resolve(false);
    };
  });
}

export function getSnapshot(): Promise<LearningSnapshot | null> {
  return idbGet<LearningSnapshot>('learning-snapshot');
}

export async function saveSnapshot(
  data: SyncResponse,
  activeListId: string | null
): Promise<boolean> {
  if (!getStoragePreference()) return false;

  const snapshot: LearningSnapshot = {
    savedAt: Date.now(),
    activeListId,
    data: {
      user: data.user,
      progress: data.progress,
      memory_hooks: data.memory_hooks,
      category_filters: data.category_filters,
      word_list_items: data.word_list_items,
      categories: data.categories,
      lists: data.lists,
      sync_revision: data.sync_revision,
    },
  };
  return idbSet('learning-snapshot', snapshot);
}

function deleteIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearAudioCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(AUDIO_CACHE_NAME).catch(() => undefined);
  if (storageAvailable()) {
    try {
      window.localStorage.removeItem(`${AUDIO_PREF_KEY}:lastCachedAt`);
      window.localStorage.removeItem(`${AUDIO_PREF_KEY}:cachedCount`);
      window.localStorage.removeItem(`${AUDIO_PREF_KEY}:cachedSizeBytes`);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

export async function clearLearningCache(): Promise<void> {
  await Promise.all([deleteIndexedDb(), clearAudioCache()]);
}

function normalizeAudioValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((url): url is string => typeof url === 'string' && url.length > 0);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

/**
 * Per-clip candidate groups: every source URL of a word side expanded to its
 * gateway candidates and deduped in the same priority order playback uses.
 * The normalized word data puts /api/audio first so browsers avoid direct
 * Arweave Signature headers unless the app proxy fails. Groups are deduped by
 * their primary URL so audio shared across words downloads once.
 */
export function getAudioCandidateGroupsForWords(words: NormalizedWord[]): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const word of words) {
    for (const side of [word.czAudio, word.viAudio]) {
      const sources = normalizeAudioValue(side);
      if (sources.length === 0) continue;
      const candidates = Array.from(
        new Set(sources.flatMap((src) => getArweaveGatewayUrlCandidates(src))),
      );
      if (candidates.length === 0 || seen.has(candidates[0])) continue;
      seen.add(candidates[0]);
      groups.push(candidates);
    }
  }
  return groups;
}

export async function cacheActiveListAudio(words: NormalizedWord[]): Promise<AudioCacheStatus> {
  activeAudioCacheController?.abort();
  activeAudioCacheController = null;

  const supported = typeof caches !== 'undefined' && typeof fetch !== 'undefined';
  const enabled = getAudioCachePreference();
  notifyAudioCachePreference(enabled);
  // Offline can't download; otherwise we proceed even on metered connections and
  // rely on the byte budget below to avoid spending data on large lists.
  if (!supported || !enabled || isAudioNetworkOffline()) {
    return getAudioCacheStatus();
  }

  // Unmetered (wifi/ethernet/desktop) caches the whole list. Metered/unknown
  // connections cache only up to a small list's worth of audio.
  const byteBudget = canBulkCacheAudio() ? Infinity : SMALL_LIST_AUDIO_BUDGET_BYTES;

  const controller = new AbortController();
  activeAudioCacheController = controller;
  const unsubscribeNetworkChanges = subscribeAudioNetworkChanges(() => {
    if (isAudioNetworkOffline()) controller.abort();
  });
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const groups = getAudioCandidateGroupsForWords(words);
  let cachedCount = 0;
  let downloadedAny = false;
  let downloadedBytes = 0;
  // A few clips failing on every source usually means connectivity is degraded;
  // individual failures must NOT stop the run (one flaky gateway or missing
  // file would otherwise leave the rest of the list uncached).
  const MAX_CONSECUTIVE_CLIP_FAILURES = 3;
  let consecutiveClipFailures = 0;

  // Unmetered connections download the whole list, so fan out concurrently
  // instead of waiting on each /api/audio round-trip in turn (a single Arweave
  // hop can take seconds). Metered connections stay single-flight so the byte
  // budget below is checked precisely after every file rather than overshooting
  // by up to `concurrency` files in parallel.
  const concurrency = byteBudget === Infinity ? AUDIO_CACHE_CONCURRENCY : 1;

  const cacheOneGroup = async (candidates: string[]): Promise<'cached' | 'failed' | 'stopped'> => {
    try {
      for (const candidate of candidates) {
        const existing = await cache.match(candidate);
        if (existing) {
          cachedCount += 1;
          return 'cached';
        }
      }
    } catch {
      // Cache read failure — fall through to the network attempts.
    }

    for (const candidate of candidates) {
      if (controller.signal.aborted || isAudioNetworkOffline()) return 'stopped';

      try {
        const response = await fetch(candidate, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        reportAudioStorageResponse(response, candidate);
        if (response.ok) {
          downloadedBytes += await getCachedResponseSizeBytes(response);
          await cache.put(candidate, response.clone());
          downloadedAny = true;
          cachedCount += 1;
          return 'cached';
        }
        // Non-OK (404/429/5xx…): try the clip's next source; the group's tail
        // ends at the /api/audio mirror, so one flaky gateway costs nothing.
      } catch {
        if (controller.signal.aborted) return 'stopped';
        // Transport failure on this candidate; try the next one.
      }
    }
    return 'failed';
  };

  // Shared work queue: each worker pulls the next clip until the list is
  // drained, the budget is hit, the download is aborted/offline, or several
  // clips in a row failed on every source (connectivity likely degraded).
  let nextGroupIndex = 0;
  const runWorker = async (): Promise<void> => {
    while (true) {
      if (controller.signal.aborted || isAudioNetworkOffline()) return;
      if (downloadedBytes >= byteBudget) return;
      const index = nextGroupIndex;
      nextGroupIndex += 1;
      if (index >= groups.length) return;
      const result = await cacheOneGroup(groups[index]);
      if (result === 'stopped') return;
      if (result === 'failed') {
        consecutiveClipFailures += 1;
        if (consecutiveClipFailures >= MAX_CONSECUTIVE_CLIP_FAILURES) {
          controller.abort();
          return;
        }
      } else {
        consecutiveClipFailures = 0;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, groups.length) }, () => runWorker()),
    );
  } finally {
    unsubscribeNetworkChanges();
    if (activeAudioCacheController === controller) {
      activeAudioCacheController = null;
    }
  }

  if (downloadedAny && storageAvailable()) {
    try {
      window.localStorage.setItem(`${AUDIO_PREF_KEY}:lastCachedAt`, String(Date.now()));
      window.localStorage.setItem(`${AUDIO_PREF_KEY}:cachedCount`, String(cachedCount));
    } catch {
      // Best-effort metadata only.
    }
  }

  return getAudioCacheStatus();
}

async function getCachedResponseSizeBytes(response: Response): Promise<number> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  try {
    return (await response.clone().blob()).size;
  } catch {
    return 0;
  }
}

export async function getAudioCacheStatus(): Promise<AudioCacheStatus> {
  const supported = typeof caches !== 'undefined';
  const enabled = getAudioCachePreference();
  let cachedCount = 0;
  let cachedSizeBytes = 0;

  if (supported) {
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const requests = await cache.keys();
      cachedCount = requests.length;
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          cachedSizeBytes += await getCachedResponseSizeBytes(response);
        }
      }
      if (storageAvailable()) {
        try {
          window.localStorage.setItem(`${AUDIO_PREF_KEY}:cachedSizeBytes`, String(cachedSizeBytes));
        } catch {
          // Best-effort metadata only.
        }
      }
    } catch {
      cachedCount = Number(window.localStorage?.getItem(`${AUDIO_PREF_KEY}:cachedCount`) ?? 0) || 0;
      cachedSizeBytes =
        Number(window.localStorage?.getItem(`${AUDIO_PREF_KEY}:cachedSizeBytes`) ?? 0) || 0;
    }
  }

  const lastCachedAt = storageAvailable()
    ? Number(window.localStorage.getItem(`${AUDIO_PREF_KEY}:lastCachedAt`) ?? 0) || null
    : null;

  return { supported, enabled, cachedCount, cachedSizeBytes, lastCachedAt };
}
