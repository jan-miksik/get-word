'use client';

import type { SyncResponse } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';

const DB_NAME = 'wordlink-learning-cache';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const STORAGE_PREF_KEY = 'wordlink-local-learning-cache-enabled';
const AUDIO_PREF_KEY = 'wordlink-active-list-audio-cache-enabled';
const AUDIO_CACHE_NAME = 'wordlink-active-list-audio-v1';

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
  lastCachedAt: number | null;
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readBooleanPreference(key: string): boolean {
  if (!storageAvailable()) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
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
  return readBooleanPreference(STORAGE_PREF_KEY);
}

export function setStoragePreference(enabled: boolean): void {
  writeBooleanPreference(STORAGE_PREF_KEY, enabled);
}

export function getAudioCachePreference(): boolean {
  return readBooleanPreference(AUDIO_PREF_KEY);
}

export function setAudioCachePreference(enabled: boolean): void {
  writeBooleanPreference(AUDIO_PREF_KEY, enabled);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
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
    ...normalizeAudioValue(word.czAudio),
    ...normalizeAudioValue(word.viAudio),
  ]);
  return Array.from(new Set(urls));
}

export async function cacheActiveListAudio(words: NormalizedWord[]): Promise<AudioCacheStatus> {
  const supported = typeof caches !== 'undefined' && typeof fetch !== 'undefined';
  const enabled = getAudioCachePreference();
  if (!supported || !enabled) {
    return getAudioCacheStatus();
  }

  const cache = await caches.open(AUDIO_CACHE_NAME);
  const urls = getAudioUrlsForWords(words);
  let cachedCount = 0;

  for (const url of urls) {
    try {
      const request = new Request(url, { credentials: 'same-origin' });
      const existing = await cache.match(request);
      if (existing) {
        cachedCount += 1;
        continue;
      }
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        cachedCount += 1;
      }
    } catch {
      // Individual audio failures should not block the cache job.
    }
  }

  if (storageAvailable()) {
    try {
      window.localStorage.setItem(`${AUDIO_PREF_KEY}:lastCachedAt`, String(Date.now()));
      window.localStorage.setItem(`${AUDIO_PREF_KEY}:cachedCount`, String(cachedCount));
    } catch {
      // Best-effort metadata only.
    }
  }

  return getAudioCacheStatus();
}

export async function getAudioCacheStatus(): Promise<AudioCacheStatus> {
  const supported = typeof caches !== 'undefined';
  const enabled = getAudioCachePreference();
  let cachedCount = 0;

  if (supported) {
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      cachedCount = (await cache.keys()).length;
    } catch {
      cachedCount = Number(window.localStorage?.getItem(`${AUDIO_PREF_KEY}:cachedCount`) ?? 0) || 0;
    }
  }

  const lastCachedAt = storageAvailable()
    ? Number(window.localStorage.getItem(`${AUDIO_PREF_KEY}:lastCachedAt`) ?? 0) || null
    : null;

  return { supported, enabled, cachedCount, lastCachedAt };
}
