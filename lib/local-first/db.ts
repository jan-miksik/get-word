'use client';

export const DB_NAME = 'get-word-learning-cache';
export const DB_VERSION = 2;

export const STORE_KV = 'kv';
export const STORE_PROGRESS = 'progress';
export const STORE_MEMORY_HOOKS = 'memory_hooks';
export const STORE_CATEGORY_FILTERS = 'category_filters';
export const STORE_PREFS = 'prefs';
export const STORE_OUTBOX = 'outbox';
export const STORE_META = 'meta';

export const META_KEY = 'meta';
export const LEGACY_SNAPSHOT_KEY = 'learning-snapshot';

export const META_SCHEMA_VERSION = 2;

export const ALL_STORES = [
  STORE_KV,
  STORE_PROGRESS,
  STORE_MEMORY_HOOKS,
  STORE_CATEGORY_FILTERS,
  STORE_PREFS,
  STORE_OUTBOX,
  STORE_META,
] as const;

export type StoreName = (typeof ALL_STORES)[number];

export interface DomainRow<T> {
  schemaVersion: number;
  updatedAt: string;
  deletedAt?: string | null;
  value: T;
}

export interface MetaRow {
  schemaVersion: number;
  deviceId: string | null;
  lastSinceCursor: string | null;
  /** content_revision from the last applied FULL snapshot; enables conditional syncs. */
  lastContentRevision?: string | null;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export interface LegacySnapshotData {
  user?: unknown;
  progress?: unknown[];
  memory_hooks?: Record<string, unknown>;
  category_filters?: unknown[];
  word_list_items?: unknown[];
  categories?: unknown[];
  lists?: unknown[];
  sync_revision?: number | string;
}

export interface LegacySnapshot {
  savedAt: number;
  activeListId: string | null;
  data: LegacySnapshotData;
}

function migrateLegacySnapshot(
  db: IDBDatabase,
  transaction: IDBTransaction
): void {
  if (!db.objectStoreNames.contains(STORE_KV)) return;
  const kvStore = transaction.objectStore(STORE_KV);
  const getRequest = kvStore.get(LEGACY_SNAPSHOT_KEY);

  getRequest.onsuccess = () => {
    const snapshot = getRequest.result as LegacySnapshot | undefined;
    if (!snapshot || !snapshot.data) return;
    const now = new Date().toISOString();
    const data = snapshot.data;

    const stamp = <T>(value: T): DomainRow<T> => ({
      schemaVersion: META_SCHEMA_VERSION,
      updatedAt: now,
      value,
    });

    try {
      if (Array.isArray(data.progress)) {
        const store = transaction.objectStore(STORE_PROGRESS);
        for (const row of data.progress) {
          const id = extractKey(row, ['wordListItemId', 'wordId', 'id']);
          if (id) store.put(stamp(row), id);
        }
      }
      if (data.memory_hooks && typeof data.memory_hooks === 'object') {
        const store = transaction.objectStore(STORE_MEMORY_HOOKS);
        for (const [key, value] of Object.entries(data.memory_hooks)) {
          store.put(stamp(value), key);
        }
      }
      if (Array.isArray(data.category_filters)) {
        const store = transaction.objectStore(STORE_CATEGORY_FILTERS);
        store.put(stamp(data.category_filters), 'all');
      }
      if (data.user) {
        const store = transaction.objectStore(STORE_PREFS);
        store.put(stamp(data.user), 'user');
      }
    } catch {
      // Best-effort migration; if any individual write fails, leave the snapshot in place.
    }
  };
}

function extractKey(row: unknown, candidates: string[]): string | null {
  if (!row || typeof row !== 'object') return null;
  const obj = row as Record<string, unknown>;
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const txn = request.transaction;
      if (!txn) return;

      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }

      const oldVersion = event.oldVersion ?? 0;
      if (oldVersion < 2) {
        migrateLegacySnapshot(db, txn);
        try {
          txn.objectStore(STORE_META).put(
            {
              schemaVersion: META_SCHEMA_VERSION,
              deviceId: null,
              lastSinceCursor: null,
            } satisfies MetaRow,
            META_KEY
          );
        } catch {
          // Meta row is best-effort; subsequent boots will write it.
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (objectStore: IDBObjectStore) => T | Promise<T>
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let result: T | null = null;
    try {
      const tx = db.transaction(store, mode);
      const objectStore = tx.objectStore(store);
      Promise.resolve(fn(objectStore)).then(
        (value) => {
          result = value ?? null;
        },
        () => {
          result = null;
        }
      );
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
      tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}
