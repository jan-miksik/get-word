'use client';

import { openDb, STORE_OUTBOX } from './db';
import type { OutboxOperation } from './operations';
import type { SyncRevisionDomain } from '@/packages/domain/sync/revision';

export type { OutboxOperation } from './operations';

type OutboxLifecycle = 'pending' | 'retrying' | 'blocked';
export type OutboxFailureKind =
  | 'retryable'
  | 'auth_required'
  | 'conflict'
  | 'permanent'
  | 'unknown';

export interface OutboxDiagnostic {
  kind: OutboxFailureKind;
  reasonCode: string;
  message: string;
  failedAt: string;
  httpStatus?: number;
}

interface OutboxMetadata {
  clientOpId: string;
  /** Stable identity of the exact aggregate request retried after a lost ACK. */
  batchId?: string;
  clientCreatedAt: string;
  deviceId: string | null;
  attempts: number;
  /** Missing only on records written by pre-lifecycle application versions. */
  status?: OutboxLifecycle;
  diagnostic?: OutboxDiagnostic;
  /** @deprecated Read compatibility for records written before diagnostics. */
  lastError?: string;
  nextAttemptAt?: number;
}

export type OutboxOp = OutboxOperation & OutboxMetadata;

const MAX_UNKNOWN_ATTEMPTS = 3;

type StatusListener = (status: OutboxStatus) => void;
const statusListeners = new Set<StatusListener>();

function notifyStatusChanged(): void {
  if (statusListeners.size === 0) return;
  // Fire-and-forget: status computation requires an IDB roundtrip, so we
  // schedule it off the critical path. Subscribers receive eventually-
  // consistent counts, which is the right tradeoff — they're for UI hints.
  void readOutboxStatus().then((status) => {
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

export async function appendOp(input: OutboxOperation & {
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
    status: 'pending',
  } as OutboxOp;

  // A second choice about the same thing replaces the first rather than
  // queueing behind it. Each revision-bearing op is sent alone and carries the
  // base revision it was created with, so two of them would go out as two
  // requests: the first bumps the server revision and the second is rejected
  // against a base that is now stale — blocked, needing an explicit rebase,
  // while the device kept showing the value it never managed to save. Only
  // unclaimed ops are superseded; one with a batchId may already be in flight,
  // and its outcome is not ours to assume.
  const supersededDomain = revisionDomainOf(op);

  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      store.put(op, op.clientOpId);
      if (supersededDomain) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const stored = cursor.value as OutboxOp;
          if (
            stored.clientOpId !== op.clientOpId &&
            !stored.batchId &&
            revisionDomainOf(stored) === supersededDomain
          ) {
            cursor.delete();
          }
          cursor.continue();
        };
      }
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
          const stored = cursor.value as OutboxOp & { status?: OutboxLifecycle };
          out.push({ ...stored, status: stored.status ?? 'pending' } as OutboxOp);
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

function sortByEnqueueOrder(ops: OutboxOp[]): OutboxOp[] {
  return ops.slice().sort((a, b) => {
    const tsCompare = a.clientCreatedAt.localeCompare(b.clientCreatedAt);
    if (tsCompare !== 0) return tsCompare;
    return a.clientOpId.localeCompare(b.clientOpId);
  });
}

/**
 * Which server-side revision an operation is arbitrated by, or null when it is
 * not revision-bearing. This is the single definition of "what this op is a
 * choice about" — batching, superseding, and rebasing all key off it, and they
 * have to agree or an op gets isolated by one rule and rebased by another.
 */
function revisionDomainOf(op: OutboxOperation): SyncRevisionDomain | null {
  if (op.entity !== 'preference') return null;
  const values = op.payload.values;
  const touchesSettings = op.payload.field === 'settings_language' ||
    Boolean(values && (
      'settings_language' in values || 'settings_language_base_revision' in values
    ));
  // Settings language wins a tie deliberately: an op carrying both is stamped
  // with the settings revision by the payload builder, so it must be batched
  // and rebased as a settings-language choice to stay consistent with the
  // request that actually goes out.
  if (touchesSettings) return 'settings_language';
  const touchesPair = op.opType === 'set_language_pair' ||
    Boolean(values && (
      'language_from' in values ||
      'language_to' in values ||
      'onboarding_completed' in values ||
      'language_pair_base_revision' in values
    ));
  if (touchesPair) return 'language_pair';
  const touchesGoal = op.opType === 'set_study_goal' ||
    op.payload.field === 'study_goal' ||
    Boolean(values && ('study_goal' in values || 'study_goal_base_revision' in values));
  return touchesGoal ? 'study_goal' : null;
}

/**
 * Operations whose payload can be rejected as a whole because its base
 * revision is stale. Keep each one in its own request so a preference
 * conflict can never strand unrelated progress or review writes.
 */
export function isRevisionAwareOperation(op: OutboxOp): boolean {
  return revisionDomainOf(op) !== null;
}

export function selectReadyOpsForBatch(
  all: OutboxOp[],
  limit: number,
  now: number = Date.now(),
): OutboxOp[] {
  const ready = all
    .filter((op) => op.status !== 'blocked')
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
  const first = ready[0];
  if (!first) return [];

  // A claimed batch is immutable across retries. `attempts` is deliberately
  // not used: independent requests commonly have the same attempt count.
  if (first.batchId) {
    return ready.filter((op) => op.batchId === first.batchId);
  }
  if (isRevisionAwareOperation(first)) return [first];
  return ready.filter((op) => !op.batchId && !isRevisionAwareOperation(op)).slice(0, limit);
}

/**
 * Select and durably claim one exact retry cohort in the same IDB transaction.
 * Once assigned, `batchId` survives backoff and is cleared only when a
 * recovery action materially changes the request (for example a rebase).
 */
export async function claimReadyBatch(
  limit: number,
  now: number = Date.now(),
): Promise<OutboxOp[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const all: OutboxOp[] = [];
    let selected: OutboxOp[] = [];
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const stored = cursor.value as OutboxOp & { status?: OutboxLifecycle };
          all.push({ ...stored, status: stored.status ?? 'pending' } as OutboxOp);
          cursor.continue();
          return;
        }

        selected = selectReadyOpsForBatch(all, limit, now);
        if (selected.length === 0 || selected[0]?.batchId) return;
        const batchId = randomId();
        selected = selected.map((op) => ({ ...op, batchId }));
        for (const op of selected) store.put(op, op.clientOpId);
      };
      tx.oncomplete = () => {
        db.close();
        resolve(sortByEnqueueOrder(selected));
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

/**
 * Counts of ops by lifecycle bucket. Useful for surfacing "stalled writes" in
 * the UI without exposing the raw outbox shape. Mirrors the semantics used by
 * `claimReadyBatch`/`markFailed` so the counts move when those functions do.
 */
export interface OutboxStatus {
  total: number;
  ready: number;
  inBackoff: number;
  blocked: number;
  authRequired: number;
  conflicts: number;
}

async function readOutboxStatus(now: number = Date.now()): Promise<OutboxStatus> {
  const all = await listOps();
  let blocked = 0;
  let authRequired = 0;
  let conflicts = 0;
  let inBackoff = 0;
  let ready = 0;
  for (const op of all) {
    if (op.status === 'blocked') {
      blocked += 1;
      if (op.diagnostic?.kind === 'auth_required') authRequired += 1;
      if (op.diagnostic?.kind === 'conflict') conflicts += 1;
    } else if ((op.nextAttemptAt ?? 0) > now) {
      inBackoff += 1;
    } else {
      ready += 1;
    }
  }
  return { total: all.length, ready, inBackoff, blocked, authRequired, conflicts };
}

export function subscribeOutboxStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  void readOutboxStatus().then(listener);
  return () => statusListeners.delete(listener);
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
  failure: Omit<OutboxDiagnostic, 'failedAt'>,
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
          const shouldBlock =
            failure.kind === 'permanent' ||
            failure.kind === 'conflict' ||
            failure.kind === 'auth_required' ||
            (failure.kind === 'unknown' && attempts >= MAX_UNKNOWN_ATTEMPTS);
          const backoffMs = Math.min(Math.pow(2, attempts) * 1000, 15 * 60_000);
          const updated: OutboxOp = {
            ...op,
            attempts,
            status: shouldBlock ? 'blocked' : 'retrying',
            diagnostic: { ...failure, failedAt: new Date().toISOString() },
            lastError: failure.message,
            nextAttemptAt: shouldBlock ? undefined : Date.now() + backoffMs,
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

export async function retryBlockedOps(clientOpIds?: string[]): Promise<void> {
  let selected: Set<string> | null = null;
  if (clientOpIds) {
    const requested = new Set(clientOpIds);
    const all = await listOps();
    const selectedBatchIds = new Set(
      all
        .filter((op) => requested.has(op.clientOpId) && op.batchId)
        .map((op) => op.batchId as string),
    );
    // Retrying one member of an unknown-outcome request must resume the exact
    // original cohort. A subset could combine server duplicates with new
    // effects and make the aggregate payload ambiguous again.
    selected = new Set(all
      .filter((op) => requested.has(op.clientOpId) || Boolean(op.batchId && selectedBatchIds.has(op.batchId)))
      .map((op) => op.clientOpId));
  }
  await updateOps((op) => {
    if (op.status !== 'blocked' || (selected && !selected.has(op.clientOpId))) return op;
    // A stale base revision cannot become valid by sending it again. Auth is
    // resumed separately after sign-in; conflicts require the explicit rebase
    // operation below.
    if (op.diagnostic?.kind === 'conflict' || op.diagnostic?.kind === 'auth_required') return op;
    return {
      ...op,
      status: 'pending',
      attempts: 0,
      diagnostic: undefined,
      lastError: undefined,
      nextAttemptAt: undefined,
      batchId: op.diagnostic?.kind === 'unknown' ? op.batchId : undefined,
    };
  });
}

export interface SyncRevisionState {
  settingsLanguageRevision: number;
  languagePairRevision: number;
  /** Epoch ms the server records for the stored choice, or null if unknown. */
  settingsLanguageChosenAt: number | null;
  languagePairChosenAt: number | null;
}

export async function rebaseBlockedPreferenceOps(revisions: SyncRevisionState): Promise<void> {
  await updateOps((op) => rebaseBlockedPreferenceOperation(op, revisions));
}

export function rebaseBlockedPreferenceOperation(
  op: OutboxOp,
  revisions: SyncRevisionState,
): OutboxOp {
  if (
    op.status !== 'blocked' ||
    op.diagnostic?.kind !== 'conflict' ||
    op.entity !== 'preference'
  ) return op;

  const domain = revisionDomainOf(op);
  if (!domain) return op;
  const touchesSettings = domain === 'settings_language';
  const values = op.payload.values;
  const touchesPair = op.opType === 'set_language_pair' || Boolean(values && (
    'language_from' in values ||
    'language_to' in values ||
    'onboarding_completed' in values
  ));

  // Rebasing re-sends the same value against a fresh base revision, so the
  // server applies it unconditionally — the base-revision path deliberately
  // skips the choice-time comparison. That is right when the revision moved
  // because of our own earlier write, and wrong when another device made a
  // newer choice: rebasing then would quietly overwrite it. Only advance an op
  // whose own intent is at least as recent as what the server holds. Anything
  // older stays blocked and visible, for the learner to discard.
  const storedChosenAt = touchesSettings
    ? revisions.settingsLanguageChosenAt
    : revisions.languagePairChosenAt;
  const opChosenAt = new Date(op.clientCreatedAt).getTime();
  if (
    storedChosenAt !== null &&
    Number.isFinite(opChosenAt) &&
    opChosenAt < storedChosenAt
  ) return op;

  const baseRevision = touchesSettings
    ? revisions.settingsLanguageRevision
    : revisions.languagePairRevision;
  const nextValues = values ? {
    ...values,
    ...(touchesSettings
      ? { settings_language_base_revision: revisions.settingsLanguageRevision }
      : {}),
    ...(touchesPair
      ? { language_pair_base_revision: revisions.languagePairRevision }
      : {}),
  } : undefined;
  return {
    ...op,
    payload: { ...op.payload, values: nextValues, baseRevision },
    status: 'pending',
    attempts: 0,
    diagnostic: undefined,
    lastError: undefined,
    nextAttemptAt: undefined,
    batchId: undefined,
  };
}

/** Resume only writes paused by an expired session after sign-in succeeds. */
export async function resumeAuthRequiredOps(): Promise<void> {
  await updateOps((op) => {
    if (op.status !== 'blocked' || op.diagnostic?.kind !== 'auth_required') return op;
    // Attempts start over. They count failures against MAX_UNKNOWN_ATTEMPTS,
    // and every attempt this op has made so far failed for a reason that is now
    // resolved. Carrying the tally forward meant a write paused across a long
    // signed-out stretch could be blocked again by its very next hiccup.
    return {
      ...op,
      status: 'pending',
      attempts: 0,
      diagnostic: undefined,
      lastError: undefined,
      nextAttemptAt: undefined,
    };
  });
}

/** Return operations the server explicitly did not apply to a fresh cohort. */
export async function releaseOpsToPending(clientOpIds: string[]): Promise<void> {
  if (clientOpIds.length === 0) return;
  const selected = new Set(clientOpIds);
  await updateOps((op) => selected.has(op.clientOpId) ? {
    ...op,
    status: 'pending',
    diagnostic: undefined,
    lastError: undefined,
    nextAttemptAt: undefined,
    batchId: undefined,
  } : op);
}

/** Explicit user recovery action. Completed operations are removed by server ack only. */
async function discardOps(clientOpIds: string[]): Promise<void> {
  await deleteOps(clientOpIds);
}

export async function discardBlockedOps(): Promise<void> {
  const blockedIds = (await listOps())
    .filter((op) => op.status === 'blocked')
    .map((op) => op.clientOpId);
  await discardOps(blockedIds);
}

async function updateOps(transform: (op: OutboxOp) => OutboxOp): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const stored = cursor.value as OutboxOp & { status?: OutboxLifecycle };
        const normalized = { ...stored, status: stored.status ?? 'pending' } as OutboxOp;
        cursor.update(transform(normalized));
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        notifyStatusChanged();
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
