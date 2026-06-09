'use client';

import type { SyncResponse } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';
import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
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
  // Audio caching is on by default. The network budget in cacheActiveListAudio
  // keeps metered connections from downloading more than a small list's worth.
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

export async function clearAudioCache(): Promise<void> {
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

export function getAudioUrlsForWords(words: NormalizedWord[]): string[] {
  const urls = words.flatMap((word) => [
    normalizeAudioValue(word.czAudio)[0],
    normalizeAudioValue(word.viAudio)[0],
  ]).filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
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
  const urls = getAudioUrlsForWords(words);
  let cachedCount = 0;
  let downloadedAny = false;
  let downloadedBytes = 0;

  try {
    for (const url of urls) {
      if (controller.signal.aborted || isAudioNetworkOffline()) break;
      if (downloadedBytes >= byteBudget) break;

      const candidates = getArweaveGatewayUrlCandidates(url);
      for (const candidate of candidates) {
        if (controller.signal.aborted || isAudioNetworkOffline()) break;

        try {
          const existing = await cache.match(candidate);
          if (existing) {
            cachedCount += 1;
            break;
          }
          const response = await fetch(candidate, {
            credentials: 'same-origin',
            signal: controller.signal,
          });
          if (response.ok) {
            downloadedBytes += await getCachedResponseSizeBytes(response);
            await cache.put(candidate, response.clone());
            downloadedAny = true;
            cachedCount += 1;
            break;
          }
          if (response.status === 408 || response.status === 429 || response.status >= 500) {
            controller.abort();
            break;
          }
        } catch {
          // Bulk caching is optional: stop after a transport failure rather
          // than attempting every audio URL while connectivity is degraded.
          controller.abort();
          break;
        }
      }
    }
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
