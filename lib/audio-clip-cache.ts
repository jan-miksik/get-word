'use client';

// Optional IndexedDB cache for audio clips, keyed by content hash. Shared by the
// list editor's audio step and the word chat's review step — one store, so a clip
// generated in either place plays instantly in the other.
//
// This is a best-effort accelerator, never a dependency: IndexedDB may be
// unavailable or blocked (private mode, restrictive/enterprise browsers, storage
// disabled). Every helper short-circuits to a no-op / null when unavailable, and all
// access is try/catch-wrapped so a failure degrades to the in-memory + network path
// and never throws into playback or generation.

const DB_NAME = 'getword-audio';
const STORE = 'clips';
const DB_VERSION = 1;

// Cleanup thresholds (in-code, tunable later). The size budget is the real guard;
// the age purge just trims stale entries.
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type ClipRecord = {
  hash: string;
  blob: Blob;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
};

let availability: boolean | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

function isSupported(): boolean {
  if (availability !== null) return availability;
  try {
    availability = typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    availability = false;
  }
  return availability;
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isSupported()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'hash' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).catch(() => null);

  return dbPromise;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Extract the content hash from an app audio-proxy URL (`/api/audio/[hash]`),
 * tolerating absolute vs relative URLs, query strings, and trailing slashes.
 * Returns null for any other URL (e.g. a raw Arweave gateway link).
 */
export function hashFromAudioUrl(url: string): string | null {
  if (!url) return null;
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const parsed = new URL(url, base);
    const marker = '/api/audio/';
    if (!parsed.pathname.startsWith(marker)) return null;
    const rest = parsed.pathname.slice(marker.length).replace(/\/+$/, '');
    const hash = rest.split('/')[0];
    return hash ? decodeURIComponent(hash) : null;
  } catch {
    return null;
  }
}

/** Read a cached clip by hash, bumping its lastAccessedAt. Null when missing/unavailable. */
export async function getClip(hash: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const record = (await promisifyRequest(store.get(hash))) as ClipRecord | undefined;
    if (!record) return null;
    record.lastAccessedAt = Date.now();
    store.put(record);
    return record.blob;
  } catch {
    return null;
  }
}

/** Store a clip blob by hash. No-op on failure. */
export async function putClip(hash: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const now = Date.now();
    const record: ClipRecord = {
      hash,
      blob,
      contentType: blob.type || 'audio/mpeg',
      sizeBytes: blob.size,
      createdAt: now,
      lastAccessedAt: now,
    };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore — cache is best-effort
  }
}

/** Delete a cached clip by hash (e.g. on force regeneration). No-op on failure. */
export async function deleteClip(hash: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(hash);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore — cache is best-effort
  }
}

/**
 * Opportunistic cleanup: drop clips older than MAX_AGE_MS, then evict
 * least-recently-accessed clips until under MAX_TOTAL_BYTES. Safe to call on init;
 * runs async and swallows all errors. Evicted clips are re-fetchable from the proxy.
 */
export async function cleanupClips(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const records = (await promisifyRequest(store.getAll())) as ClipRecord[];
    const now = Date.now();

    const survivors: ClipRecord[] = [];
    for (const record of records) {
      if (now - record.createdAt > MAX_AGE_MS) {
        store.delete(record.hash);
      } else {
        survivors.push(record);
      }
    }

    let total = survivors.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
    if (total > MAX_TOTAL_BYTES) {
      survivors.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt); // oldest first
      for (const record of survivors) {
        if (total <= MAX_TOTAL_BYTES) break;
        store.delete(record.hash);
        total -= record.sizeBytes || 0;
      }
    }
  } catch {
    // ignore — cleanup is best-effort
  }
}
