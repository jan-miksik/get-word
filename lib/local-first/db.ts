'use client';

export const DB_NAME = 'get-word-learning-cache';
export const DB_VERSION = 4;
export const OLDEST_SUPPORTED_DB_VERSION = 1;

export const STORE_KV = 'kv';
export const STORE_PROGRESS = 'progress';
export const STORE_MEMORY_HOOKS = 'memory_hooks';
export const STORE_CATEGORY_FILTERS = 'category_filters';
export const STORE_PREFS = 'prefs';
export const STORE_OUTBOX = 'outbox';
export const STORE_META = 'meta';
export const STORE_CONTENT = 'content';

export const META_KEY = 'meta';
const LEGACY_SNAPSHOT_KEY = 'learning-snapshot';

export const META_SCHEMA_VERSION = 3;

const ALL_STORES = [
  STORE_KV,
  STORE_PROGRESS,
  STORE_MEMORY_HOOKS,
  STORE_CATEGORY_FILTERS,
  STORE_PREFS,
  STORE_OUTBOX,
  STORE_META,
  STORE_CONTENT,
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

interface LegacySnapshotData {
  user?: unknown;
  progress?: unknown[];
  memory_hooks?: Record<string, unknown>;
  category_filters?: unknown[];
  word_list_items?: unknown[];
  categories?: unknown[];
  lists?: unknown[];
  sync_revision?: number | string;
}

interface LegacySnapshot {
  savedAt: number;
  activeListId: string | null;
  data: LegacySnapshotData;
}

export function migrationVersionsFrom(oldVersion: number): number[] {
  const first = Math.max(1, Math.floor(oldVersion) + 1);
  const versions: number[] = [];
  for (let version = first; version <= DB_VERSION; version += 1) versions.push(version);
  return versions;
}

export function normalizeLegacyOutboxRecord(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.status === 'pending' || record.status === 'retrying' || record.status === 'blocked') {
    return value;
  }
  return { ...record, status: 'pending' };
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

function migrateLegacyContent(transaction: IDBTransaction): void {
  try {
    const legacyStore = transaction.objectStore(STORE_KV);
    const contentStore = transaction.objectStore(STORE_CONTENT);
    const request = legacyStore.get(LEGACY_SNAPSHOT_KEY);
    request.onsuccess = () => {
      const snapshot = request.result as LegacySnapshot | undefined;
      if (!snapshot?.data) return;
      contentStore.put(
        {
          schemaVersion: META_SCHEMA_VERSION,
          updatedAt: new Date(snapshot.savedAt || Date.now()).toISOString(),
          deletedAt: null,
          value: {
            word_list_items: snapshot.data.word_list_items,
            categories: snapshot.data.categories,
            lists: snapshot.data.lists,
            sync_revision: snapshot.data.sync_revision,
          },
        } satisfies DomainRow<unknown>,
        'sync-content',
      );
    };
  } catch {
    // Keep the legacy snapshot untouched. The compatibility reader can still
    // use it and a later successful server hydration will populate content.
  }
}

function migrateOutboxLifecycle(transaction: IDBTransaction): void {
  let store: IDBObjectStore;
  try {
    store = transaction.objectStore(STORE_OUTBOX);
  } catch {
    return;
  }
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    try {
      cursor.update(normalizeLegacyOutboxRecord(cursor.value));
    } catch {
      // Never delete the old record on conversion failure. A future boot can
      // still normalize the missing status while reading it.
    }
    cursor.continue();
  };
}

function migrateMetaVersion(transaction: IDBTransaction): void {
  try {
    const store = transaction.objectStore(STORE_META);
    const request = store.get(META_KEY);
    request.onsuccess = () => {
      const current = request.result as Partial<MetaRow> | undefined;
      store.put(
        {
          deviceId: null,
          lastSinceCursor: null,
          ...current,
          schemaVersion: META_SCHEMA_VERSION,
        } satisfies MetaRow,
        META_KEY,
      );
    };
  } catch {
    // A missing/corrupt meta row only disables warm boot; server hydration can
    // recreate it without deleting usable domain stores.
  }
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
      if (oldVersion < 3) {
        migrateOutboxLifecycle(txn);
        migrateMetaVersion(txn);
      }
      if (oldVersion < 4) {
        migrateLegacyContent(txn);
        migrateMetaVersion(txn);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
