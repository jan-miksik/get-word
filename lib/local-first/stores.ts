'use client';

import {
  openDb,
  META_KEY,
  META_SCHEMA_VERSION,
  STORE_CATEGORY_FILTERS,
  STORE_CONTENT,
  STORE_MEMORY_HOOKS,
  STORE_META,
  STORE_PREFS,
  STORE_PROGRESS,
  type DomainRow,
  type MetaRow,
  type StoreName,
} from './db';

async function readOne<T>(store: StoreName, key: string): Promise<DomainRow<T> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).get(key);
      let value: DomainRow<T> | null = null;
      request.onsuccess = () => {
        value = (request.result as DomainRow<T> | undefined) ?? null;
      };
      request.onerror = () => {
        value = null;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function readAll<T>(store: StoreName): Promise<Array<{ key: string; row: DomainRow<T> }>> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const results: Array<{ key: string; row: DomainRow<T> }> = [];
    try {
      const tx = db.transaction(store, 'readonly');
      const objectStore = tx.objectStore(store);
      const request = objectStore.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push({ key: String(cursor.key), row: cursor.value as DomainRow<T> });
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(results);
      };
      tx.onerror = () => {
        db.close();
        resolve(results);
      };
    } catch {
      db.close();
      resolve(results);
    }
  });
}

async function writeOne<T>(store: StoreName, key: string, row: DomainRow<T>): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(row, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

function stamp<T>(value: T, options?: { updatedAt?: string; deletedAt?: string | null }): DomainRow<T> {
  return {
    schemaVersion: META_SCHEMA_VERSION,
    updatedAt: options?.updatedAt ?? new Date().toISOString(),
    deletedAt: options?.deletedAt ?? null,
    value,
  };
}

// Progress (keyed by wordListItemId or wordId — caller decides)
export function getAllProgressRows<T>() {
  return readAll<T>(STORE_PROGRESS);
}
export function putProgressRow<T>(id: string, value: T, options?: { updatedAt?: string }) {
  return writeOne(STORE_PROGRESS, id, stamp(value, options));
}
// Memory hooks
export function getAllMemoryHookRows<T>() {
  return readAll<T>(STORE_MEMORY_HOOKS);
}
export function putMemoryHookRow<T>(id: string, value: T, options?: { updatedAt?: string; deletedAt?: string | null }) {
  return writeOne(STORE_MEMORY_HOOKS, id, stamp(value, options));
}

// Category filters (single row keyed by scope, default 'all')
export function getCategoryFilterRow<T>(scope = 'all') {
  return readOne<T>(STORE_CATEGORY_FILTERS, scope);
}
export function putCategoryFilterRow<T>(scope: string, value: T, options?: { updatedAt?: string }) {
  return writeOne(STORE_CATEGORY_FILTERS, scope, stamp(value, options));
}

// Preferences (single row keyed 'user')
export function getPrefsRow<T>(key = 'user') {
  return readOne<T>(STORE_PREFS, key);
}
export function putPrefsRow<T>(key: string, value: T, options?: { updatedAt?: string }) {
  return writeOne(STORE_PREFS, key, stamp(value, options));
}

// Synced list/category content (single atomic snapshot row).
export function getContentRow<T>() {
  return readOne<T>(STORE_CONTENT, 'sync-content');
}
export function putContentRow<T>(value: T, options?: { updatedAt?: string }) {
  return writeOne(STORE_CONTENT, 'sync-content', stamp(value, options));
}

// Meta
export async function getMeta(): Promise<MetaRow | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readonly');
      const request = tx.objectStore(STORE_META).get(META_KEY);
      let value: MetaRow | null = null;
      request.onsuccess = () => {
        value = (request.result as MetaRow | undefined) ?? null;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function putMeta(patch: Partial<MetaRow>): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);
      const getRequest = store.get(META_KEY);
      getRequest.onsuccess = () => {
        const existing = (getRequest.result as MetaRow | undefined) ?? {
          schemaVersion: META_SCHEMA_VERSION,
          deviceId: null,
          lastSinceCursor: null,
        };
        store.put({ ...existing, ...patch, schemaVersion: META_SCHEMA_VERSION }, META_KEY);
      };
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}
