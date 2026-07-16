'use client';

// Local-only IndexedDB storage for Photo Lab: downscaled photo blobs keyed by
// content hash plus the analysis sessions that reference them. Nothing here is
// synced to the server.
//
// Best-effort like audioBlobStore: IndexedDB may be unavailable or blocked
// (private mode, restrictive browsers, iOS eviction). Every helper
// short-circuits to null / no-op on failure, so a freshly analyzed photo still
// renders from memory even when persistence fails — only history is lost.

import type { PhotoLabSession } from '@/features/photo-lab/types';

const DB_NAME = 'getword-photo-lab';
const PHOTOS_STORE = 'photos';
const SESSIONS_STORE = 'sessions';
const DB_VERSION = 1;

const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type PhotoRecord = {
  hash: string;
  /**
   * JPEG bytes + mime type. Stored as ArrayBuffer instead of Blob because iOS
   * WebKit can silently drop the file-backed data of Blobs kept in IndexedDB —
   * the record survives the next visit but the Blob reads as empty, rendering
   * broken images. Buffers are copied into the database, so they persist.
   */
  bytes?: ArrayBuffer;
  type?: string;
  /** Legacy records (DB v1 writes before the ArrayBuffer switch) stored the Blob itself. */
  blob?: Blob;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
};

function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error('Could not read photo blob.'));
    reader.onerror = () => reject(new Error('Could not read photo blob.'));
    reader.readAsArrayBuffer(blob);
  });
}

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
        if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
          db.createObjectStore(PHOTOS_STORE, { keyPath: 'hash' });
        }
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
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

function awaitTx(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

/** Read a stored photo by hash, bumping lastAccessedAt. Null when missing/unavailable. */
export async function getPhoto(hash: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(PHOTOS_STORE, 'readwrite');
    const store = tx.objectStore(PHOTOS_STORE);
    const record = (await promisifyRequest(store.get(hash))) as PhotoRecord | undefined;
    if (!record) return null;
    record.lastAccessedAt = Date.now();
    store.put(record);
    if (record.bytes) return new Blob([record.bytes], { type: record.type || 'image/jpeg' });
    if (!(record.blob instanceof Blob)) return null;
    // Legacy record storing the Blob itself. Reading the bytes both validates
    // it (iOS WebKit can have dropped the data, which would render as a broken
    // image) and lets us heal it into the ArrayBuffer format.
    try {
      const bytes = await readBlobBytes(record.blob);
      const type = record.blob.type || 'image/jpeg';
      const healed: PhotoRecord = { ...record, bytes, type };
      delete healed.blob;
      const healTx = db.transaction(PHOTOS_STORE, 'readwrite');
      healTx.objectStore(PHOTOS_STORE).put(healed);
      return new Blob([bytes], { type });
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** Store a photo blob by hash. Returns false on failure so the caller can skip the session write. */
export async function putPhoto(hash: string, blob: Blob): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    // Copy the bytes out before opening the transaction — the async read would
    // auto-close an already-open one, and Blobs must not be stored directly
    // (see PhotoRecord).
    const bytes = await readBlobBytes(blob);
    const now = Date.now();
    const record: PhotoRecord = {
      hash,
      bytes,
      type: blob.type || 'image/jpeg',
      sizeBytes: bytes.byteLength,
      createdAt: now,
      lastAccessedAt: now,
    };
    const tx = db.transaction(PHOTOS_STORE, 'readwrite');
    tx.objectStore(PHOTOS_STORE).put(record);
    return await awaitTx(tx);
  } catch {
    return false;
  }
}

/**
 * Persist a session. Callers must only invoke this after `putPhoto` succeeded,
 * so history never references a missing blob.
 */
export async function putSession(session: PhotoLabSession): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).put(session);
    return await awaitTx(tx);
  } catch {
    return false;
  }
}

/**
 * Merge audio hashes into a stored session. Read-modify-write of the latest
 * stored row — never write a session object captured before the audio request
 * resolved, or it would clobber newer data. No-op when the session is gone.
 */
export async function updateSessionAudioHashes(
  sessionId: string,
  audioHashes: Record<string, string>,
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);
    const session = (await promisifyRequest(store.get(sessionId))) as
      | PhotoLabSession
      | undefined;
    if (!session) return false;
    store.put({ ...session, audioHashes });
    return await awaitTx(tx);
  } catch {
    return false;
  }
}

/** All sessions, newest first. Empty on failure. */
export async function listSessions(): Promise<PhotoLabSession[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const sessions = (await promisifyRequest(
      tx.objectStore(SESSIONS_STORE).getAll(),
    )) as PhotoLabSession[];
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/**
 * Delete a session and, when no other session references its photo, the photo
 * blob too — in one readwrite transaction across both stores so a concurrent
 * save can't be left pointing at a half-deleted pair.
 */
export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([SESSIONS_STORE, PHOTOS_STORE], 'readwrite');
    const sessionsStore = tx.objectStore(SESSIONS_STORE);
    const target = (await promisifyRequest(sessionsStore.get(id))) as
      | PhotoLabSession
      | undefined;
    if (target) {
      sessionsStore.delete(id);
      const all = (await promisifyRequest(sessionsStore.getAll())) as PhotoLabSession[];
      const stillReferenced = all.some(
        (session) => session.id !== id && session.photoHash === target.photoHash,
      );
      if (!stillReferenced) {
        tx.objectStore(PHOTOS_STORE).delete(target.photoHash);
      }
    }
    await awaitTx(tx);
  } catch {
    // ignore — storage is best-effort
  }
}

/**
 * Opportunistic cleanup: drop sessions older than MAX_AGE_MS, then evict the
 * oldest sessions until photo bytes fit MAX_TOTAL_BYTES. Sessions and their
 * blobs are always removed together. Safe to call on page mount.
 */
export async function cleanupPhotoLab(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([SESSIONS_STORE, PHOTOS_STORE], 'readwrite');
    const sessionsStore = tx.objectStore(SESSIONS_STORE);
    const photosStore = tx.objectStore(PHOTOS_STORE);
    const sessions = (await promisifyRequest(sessionsStore.getAll())) as PhotoLabSession[];
    const photos = (await promisifyRequest(photosStore.getAll())) as PhotoRecord[];
    const photoByHash = new Map(photos.map((record) => [record.hash, record]));
    const now = Date.now();

    const survivors: PhotoLabSession[] = [];
    for (const session of sessions) {
      if (now - session.createdAt > MAX_AGE_MS) {
        sessionsStore.delete(session.id);
      } else {
        survivors.push(session);
      }
    }

    const referencedBytes = (list: PhotoLabSession[]) => {
      const hashes = new Set(list.map((session) => session.photoHash));
      let total = 0;
      for (const hash of hashes) {
        total += photoByHash.get(hash)?.sizeBytes ?? 0;
      }
      return { hashes, total };
    };

    survivors.sort((a, b) => a.createdAt - b.createdAt); // oldest first
    let { hashes, total } = referencedBytes(survivors);
    while (total > MAX_TOTAL_BYTES && survivors.length > 0) {
      const evicted = survivors.shift()!;
      sessionsStore.delete(evicted.id);
      ({ hashes, total } = referencedBytes(survivors));
    }

    // Remove blobs no surviving session references (also covers the age purge).
    for (const record of photos) {
      if (!hashes.has(record.hash)) {
        photosStore.delete(record.hash);
      }
    }
    await awaitTx(tx);
  } catch {
    // ignore — cleanup is best-effort
  }
}
