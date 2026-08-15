'use client';

import {
  syncUserData,
  getSyncOwner,
  isAuthRequiredError,
  publishSyncResponse,
  SyncRequestError,
} from '@/lib/sync';
import { buildPayloadFromOps } from './payload-builder';
import {
  claimReadyBatch,
  deleteOps,
  isRevisionAwareOperation,
  markFailed,
  releaseOpsToPending,
  type OutboxFailureKind,
  type OutboxOp,
} from './outbox';
import { ensureLocalFirstAvailability } from './availability';
import { checkpointAcknowledgedOps } from './hydrate';
import type { SyncOperationResult, SyncResponse } from '@/features/sync/types';

const MAX_BATCH = 25;
const DEBOUNCE_MS = 30_000;
const PERIODIC_DRAIN_MS = 10 * 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let drainInFlight: Promise<void> | null = null;
let scheduledByVisibility = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

export function scheduleDrain(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void drainOnce();
  }, DEBOUNCE_MS);
}

/**
 * Push everything the outbox is holding and resolve once the server has
 * answered, joining a drain that is already running rather than starting a
 * second one.
 *
 * Callers that are about to *read* from the server use this to order the two
 * halves of a sync: a GET issued while a POST is still in flight is answered
 * from pre-mutation state, and by the time it lands the acknowledged ops are
 * gone from the outbox, so the stale rows arrive unmasked. Draining first
 * keeps the read behind the write. Never rejects — a failed drain leaves the
 * ops queued for the next attempt and must not block the read.
 */
export async function flushOutboxBeforeRead(): Promise<void> {
  await drainOnce().catch(() => undefined);
}

/**
 * Push the outbox now, for callers that are shutting down rather than reading.
 *
 * Exists so lifecycle handlers outside this module do not have to rely on
 * being registered before the drainer's own `pagehide` listener — an ordering
 * that is an accident of import order and that a refactor could silently
 * invert. Best-effort by nature: the browser may end execution at any point,
 * which is why durability rests on local persistence rather than on this call.
 */
export async function flushOutboxNow(): Promise<void> {
  await drainOnce().catch(() => undefined);
}

async function drainOnce(): Promise<void> {
  if (drainInFlight) return drainInFlight;
  drainInFlight = doDrain().finally(() => {
    drainInFlight = null;
  });
  return drainInFlight;
}

async function doDrain(): Promise<void> {
  const available = await ensureLocalFirstAvailability();
  if (!available) return;

  const ops = await claimReadyBatch(MAX_BATCH);
  if (ops.length === 0) return;

  const built = buildPayloadFromOps(ops, { owner: getSyncOwner() });
  if (!built) {
    await deleteOps(ops.map((op) => op.clientOpId));
    return;
  }

  // Not a failure worth surfacing: activity measured under a previous account
  // simply has nowhere to go, so it is dropped instead of being flagged for
  // recovery like a malformed payload.
  if (built.discardedClientOpIds.length > 0) {
    await deleteOps(built.discardedClientOpIds);
  }

  if (built.invalidClientOpIds.length > 0) {
    await markFailed(built.invalidClientOpIds, {
      kind: 'permanent',
      reasonCode: 'INVALID_OUTBOX_PAYLOAD',
      message: 'Stored operation payload is malformed and requires user recovery',
    });
  }
  if (built.clientOpIds.length === 0) return;

  try {
    // The low-level transport must not publish the raw ack: it intentionally
    // omits most domains. Publish only after acknowledged operations have been
    // projected durably and removed from the outbox.
    const response = await syncUserData(built.payload, { emitEvent: false });
    await handleSuccessfulResponse(response, ops, built.clientOpIds, built.payload.review_events);
  } catch (error) {
    if (isAuthRequiredError(error)) {
      await markFailed(built.clientOpIds, {
        kind: 'auth_required',
        reasonCode: 'AUTH_REQUIRED',
        message: error instanceof Error ? error.message : 'Authentication required',
        httpStatus: 401,
      });
      return;
    }
    if (error instanceof SyncRequestError && error.status === 409) {
      await handleConflictResponse(error, ops, built.clientOpIds);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifySyncFailure(error);
    await markFailed(built.clientOpIds, {
      ...classification,
      message,
    });
  }
}

function operationResults(payload: unknown): SyncOperationResult[] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { op_results?: unknown }).op_results;
  if (!Array.isArray(results)) return [];
  return results.filter((result): result is SyncOperationResult => Boolean(
    result &&
    typeof result === 'object' &&
    typeof (result as { clientOpId?: unknown }).clientOpId === 'string' &&
    ['applied', 'duplicate', 'blocked', 'conflict', 'retry'].includes(
      String((result as { status?: unknown }).status),
    )
  ));
}

async function handleSuccessfulResponse(
  response: SyncResponse,
  ops: OutboxOp[],
  clientOpIds: string[],
  submittedReviewEvents?: Parameters<typeof publishSyncResponse>[1],
): Promise<void> {
  const results = operationResults(response);
  const completed = new Set(
    results
      .filter((result) => result.status === 'applied' || result.status === 'duplicate')
      .map((result) => result.clientOpId),
  );
  const blocked = results.filter((result) => result.status === 'blocked');
  const conflicts = results.filter((result) => result.status === 'conflict');
  const deferred = results.filter((result) => result.status === 'retry');
  // Legacy 2xx responses without per-op acks mean the complete aggregate was
  // accepted. Keep this compatibility behavior until every deployed server
  // emits op_results — but key it on the server having said nothing at all, not
  // on the acknowledged set being empty. A response that spoke and acknowledged
  // nothing (every op deferred or blocked) means the opposite of "accepted".
  const spoke = Array.isArray(response.op_results);
  const applied = new Set<string>(
    spoke
      ? completed
      : Array.isArray(response.applied_client_op_ids) ? response.applied_client_op_ids : [],
  );
  const toDelete = spoke || applied.size > 0
    ? clientOpIds.filter((id) => applied.has(id))
    : clientOpIds;
  const acknowledgedOps = ops.filter((op) => toDelete.includes(op.clientOpId));
  const failed = clientOpIds.filter((id) => !toDelete.includes(id));

  if (acknowledgedOps.length > 0) {
    const reconciled = await checkpointAcknowledgedOps(response, acknowledgedOps);
    if (!reconciled) {
      await markFailed(toDelete, {
        kind: 'retryable',
        reasonCode: 'LOCAL_CHECKPOINT_FAILED',
        message: 'Server acknowledged the operation but its local projection could not be saved',
      });
    } else {
      await deleteOps(toDelete);
      publishSyncResponse(reconciled, submittedReviewEvents);
    }
  }

  for (const result of blocked) {
    await markFailed([result.clientOpId], {
      kind: 'permanent',
      reasonCode: result.code ?? 'SERVER_BLOCKED',
      message: 'Server blocked the operation',
    });
  }
  for (const result of conflicts) {
    await markFailed([result.clientOpId], {
      kind: 'conflict',
      reasonCode: result.code ?? 'SYNC_CONFLICT',
      message: 'Operation requires refresh or rebase',
    });
  }
  // Retryable rather than blocked: the server could not store it yet and said
  // so, which is a condition that clears itself without the user doing anything.
  for (const result of deferred) {
    await markFailed([result.clientOpId], {
      kind: 'retryable',
      reasonCode: result.code ?? 'SERVER_DEFERRED',
      message: 'Server accepted the request but could not store this operation yet',
    });
  }
  if (failed.length === 0) return;
  const explicitlyHandled = new Set(
    [...blocked, ...conflicts, ...deferred].map((result) => result.clientOpId),
  );
  const unclassified = failed.filter((id) => !explicitlyHandled.has(id));
  if (unclassified.length === 0) return;
  const message = failed
    .map((id) => response.op_errors?.[id])
    .find(Boolean) ?? 'Server did not acknowledge operation';
  await markFailed(unclassified, {
    kind: 'unknown',
    reasonCode: 'SYNC_NOT_ACKNOWLEDGED',
    message,
  });
}

async function handleConflictResponse(
  error: SyncRequestError,
  ops: OutboxOp[],
  clientOpIds: string[],
): Promise<void> {
  const byId = new Map(ops.map((op) => [op.clientOpId, op]));
  const results = operationResults(error.payload);
  const reportedIds = new Set(results.map((result) => result.clientOpId));
  const conflictingIds = clientOpIds.filter((id) => {
    const op = byId.get(id);
    return Boolean(op && isRevisionAwareOperation(op));
  });
  const unrelatedIds = clientOpIds.filter((id) => !conflictingIds.includes(id));

  // A revision conflict aborts the aggregate transaction. Even if an older
  // server labels every id as conflict, only revision-aware commands require
  // rebase; unrelated commands were not applied and return to a fresh cohort.
  await releaseOpsToPending(unrelatedIds);
  for (const id of conflictingIds) {
    const result = results.find((candidate) => candidate.clientOpId === id);
    await markFailed([id], {
      kind: 'conflict',
      reasonCode: result?.code ?? 'SYNC_CONFLICT',
      message: error.message || 'Operation requires refresh or rebase',
      httpStatus: error.status,
    });
  }

  // A malformed/legacy 409 without a revision-aware operation cannot be
  // safely transformed into a permanent block. Preserve its per-op body for
  // diagnostics, but retry the exact operation set as a fresh cohort.
  if (conflictingIds.length === 0) {
    await releaseOpsToPending(clientOpIds);
  } else if (results.length > 0) {
    const unreported = clientOpIds.filter((id) => !reportedIds.has(id));
    await releaseOpsToPending(unreported.filter((id) => !conflictingIds.includes(id)));
  }
}

export function classifySyncFailure(error: unknown): {
  kind: OutboxFailureKind;
  reasonCode: string;
  httpStatus?: number;
} {
  if (!(error instanceof SyncRequestError)) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('network') || message.includes('timeout') || message.includes('timed out')) {
      return { kind: 'retryable', reasonCode: 'NETWORK_OR_TIMEOUT' };
    }
    return { kind: 'unknown', reasonCode: 'UNCLASSIFIED_SYNC_ERROR' };
  }
  if (error.status === 409) {
    return { kind: 'conflict', reasonCode: 'SYNC_CONFLICT', httpStatus: error.status };
  }
  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return { kind: 'retryable', reasonCode: `HTTP_${error.status}`, httpStatus: error.status };
  }
  if ([400, 403, 404, 410, 422].includes(error.status)) {
    return { kind: 'permanent', reasonCode: `HTTP_${error.status}`, httpStatus: error.status };
  }
  return { kind: 'unknown', reasonCode: `HTTP_${error.status}`, httpStatus: error.status };
}

interface DrainerLifecycle {
  start(): void;
  stop(): void;
}

let lifecycle: DrainerLifecycle | null = null;

export function startDrainer(): DrainerLifecycle {
  if (lifecycle) return lifecycle;
  if (typeof window === 'undefined') {
    return { start() {}, stop() {} };
  }

  const handleOnline = () => {
    void drainOnce();
  };
  const handleFocus = () => {
    void drainOnce();
  };
  const handleLeavingPage = () => {
    void drainOnce();
  };
  const handleVisibility = () => {
    if (!scheduledByVisibility) {
      scheduledByVisibility = true;
      queueMicrotask(() => {
        scheduledByVisibility = false;
        void drainOnce();
      });
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pageshow', handleFocus);
  window.addEventListener('blur', handleLeavingPage);
  window.addEventListener('pagehide', handleLeavingPage);
  window.addEventListener('beforeunload', handleLeavingPage);
  document.addEventListener('visibilitychange', handleVisibility);

  // Drain any persisted ops on boot.
  void drainOnce();
  periodicTimer = setInterval(() => {
    void drainOnce();
  }, PERIODIC_DRAIN_MS);

  lifecycle = {
    start() {},
    stop() {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      window.removeEventListener('blur', handleLeavingPage);
      window.removeEventListener('pagehide', handleLeavingPage);
      window.removeEventListener('beforeunload', handleLeavingPage);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (periodicTimer) {
        clearInterval(periodicTimer);
        periodicTimer = null;
      }
      lifecycle = null;
    },
  };
  return lifecycle;
}
