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

type StatusListener = (status: OutboxStatus) => void;
const statusListeners = new Set<StatusListener>();

function notifyStatusChanged(): void {
  if (statusListeners.size === 0) return;
  // Fire-and-forget: status computation requires an IDB roundtrip, so we
  // schedule it off the critical path. Subscribers receive eventually-
  // consistent counts, which is the right tradeoff — they're for UI hints.
  void getOutboxStatus().then((status) => {
    for (const listener of statusListeners) {
      listener(status);
    }
  });
}

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
        notifyStatusChanged();
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
    // Primary order by enqueue time, but tie-break on clientOpId so two ops
    // enqueued in the same millisecond have a deterministic order across
    // drains. Without the tie-break, the IDB cursor's traversal order (and any
    // sort algorithm instability) could reshuffle same-ms ops between attempts.
    .sort((a, b) => {
      const tsCompare = a.clientCreatedAt.localeCompare(b.clientCreatedAt);
      if (tsCompare !== 0) return tsCompare;
      return a.clientOpId.localeCompare(b.clientOpId);
    });
  return ready.slice(0, limit);
}

/**
 * Counts of ops by lifecycle bucket. Useful for surfacing "stalled writes" in
 * the UI without exposing the raw outbox shape. Mirrors the semantics used by
 * `peekReadyOps`/`markFailed` so the counts move when those functions do.
 */
interface OutboxStatus {
  total: number;
  ready: number;
  inBackoff: number;
  abandoned: number;
}

async function getOutboxStatus(now: number = Date.now()): Promise<OutboxStatus> {
  const all = await listOps();
  let abandoned = 0;
  let inBackoff = 0;
  let ready = 0;
  for (const op of all) {
    if (op.attempts >= MAX_ATTEMPTS_PER_SESSION) {
      abandoned += 1;
    } else if ((op.nextAttemptAt ?? 0) > now) {
      inBackoff += 1;
    } else {
      ready += 1;
    }
  }
  return { total: all.length, ready, inBackoff, abandoned };
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
        notifyStatusChanged();
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
        notifyStatusChanged();
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
