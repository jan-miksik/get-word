'use client';

import { openDb, STORE_META, META_KEY, META_SCHEMA_VERSION, type MetaRow } from './db';

const SENTINEL_KEY = '__probe_sentinel';
let probePromise: Promise<boolean> | null = null;
let probeResult: boolean | null = null;
let lastProbedAt = 0;

const PROBE_TTL_MS = 60_000;

export function isLocalFirstAvailableSync(): boolean {
  return probeResult === true;
}

export function resetLocalFirstAvailability(): void {
  probePromise = null;
  probeResult = null;
  lastProbedAt = 0;
}

export function ensureLocalFirstAvailability(): Promise<boolean> {
  if (probeResult !== null && Date.now() - lastProbedAt < PROBE_TTL_MS) {
    return Promise.resolve(probeResult);
  }
  if (probePromise) return probePromise;
  probePromise = probe().then((ok) => {
    probeResult = ok;
    lastProbedAt = Date.now();
    probePromise = null;
    return ok;
  });
  return probePromise;
}

async function probe(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  const db = await openDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);
      const sentinel = { at: Date.now() };
      store.put(sentinel, SENTINEL_KEY);
      const readRequest = store.get(SENTINEL_KEY);
      let readOk = false;
      readRequest.onsuccess = () => {
        readOk = !!readRequest.result;
      };
      readRequest.onerror = () => {
        readOk = false;
      };
      tx.oncomplete = () => {
        // Ensure a meta row exists with current schema version.
        ensureMetaRow(db).finally(() => {
          db.close();
          resolve(readOk);
        });
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

async function ensureMetaRow(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);
      const getRequest = store.get(META_KEY);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as MetaRow | undefined;
        // Spread existing first so fields added to MetaRow later (e.g.
        // lastContentRevision) survive the availability probe.
        const next: MetaRow = {
          ...existing,
          schemaVersion: META_SCHEMA_VERSION,
          deviceId: existing?.deviceId ?? null,
          lastSinceCursor: existing?.lastSinceCursor ?? null,
        };
        store.put(next, META_KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
