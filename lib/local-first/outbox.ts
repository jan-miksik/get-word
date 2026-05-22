'use client';

import { openDb, STORE_OUTBOX } from './db';

export type OutboxEntity =
  | 'progress'
  | 'memory_hook'
  | 'preference'
  | 'category_filters'
  | 'game_score'
  | 'review_event';

export interface OutboxOp {
  clientOpId: string;
  entity: OutboxEntity;
  opType: string;
  payload: unknown;
  clientCreatedAt: string;
  deviceId: string | null;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: number;
}

const MAX_ATTEMPTS_PER_SESSION = 8;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function appendOp(input: {
  entity: OutboxEntity;
  opType: string;
  payload: unknown;
  deviceId: string | null;
  clientOpId?: string;
  clientCreatedAt?: string;
}): Promise<OutboxOp | null> {
  const op: OutboxOp = {
    clientOpId: input.clientOpId ?? randomId(),
    entity: input.entity,
    opType: input.opType,
    payload: input.payload,
    clientCreatedAt: input.clientCreatedAt ?? new Date().toISOString(),
    deviceId: input.deviceId,
    attempts: 0,
  };

  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).put(op, op.clientOpId);
      tx.oncomplete = () => {
        db.close();
        resolve(op);
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

export async function listOps(): Promise<OutboxOp[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const out: OutboxOp[] = [];
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readonly');
      const request = tx.objectStore(STORE_OUTBOX).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          out.push(cursor.value as OutboxOp);
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(out);
      };
      tx.onerror = () => {
        db.close();
        resolve(out);
      };
    } catch {
      db.close();
      resolve(out);
    }
  });
}

export async function peekReadyOps(limit: number, now: number = Date.now()): Promise<OutboxOp[]> {
  const all = await listOps();
  const ready = all
    .filter((op) => op.attempts < MAX_ATTEMPTS_PER_SESSION)
    .filter((op) => (op.nextAttemptAt ?? 0) <= now)
    .sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt));
  return ready.slice(0, limit);
}

export async function deleteOps(clientOpIds: string[]): Promise<void> {
  if (clientOpIds.length === 0) return;
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      for (const id of clientOpIds) {
        store.delete(id);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function markFailed(
  clientOpIds: string[],
  errorByOpId: Record<string, string> = {}
): Promise<void> {
  if (clientOpIds.length === 0) return;
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      for (const id of clientOpIds) {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const op = getRequest.result as OutboxOp | undefined;
          if (!op) return;
          const attempts = op.attempts + 1;
          const backoffMs = Math.min(Math.pow(2, attempts) * 1000, 60_000);
          const updated: OutboxOp = {
            ...op,
            attempts,
            lastError: errorByOpId[id] ?? op.lastError ?? 'unknown',
            nextAttemptAt: Date.now() + backoffMs,
          };
          store.put(updated, id);
        };
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function clearAllOps(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export { MAX_ATTEMPTS_PER_SESSION };
