'use client';

import { syncUserData, isAuthRequiredError } from '@/lib/sync';
import { buildPayloadFromOps } from './payload-builder';
import { deleteOps, markFailed, peekReadyOps } from './outbox';
import { ensureLocalFirstAvailability } from './availability';

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

  const ops = await peekReadyOps(MAX_BATCH);
  if (ops.length === 0) return;

  const built = buildPayloadFromOps(ops);
  if (!built) {
    await deleteOps(ops.map((op) => op.clientOpId));
    return;
  }

  try {
    const response = await syncUserData(built.payload);
    const applied = new Set<string>(
      Array.isArray(response?.applied_client_op_ids) ? response.applied_client_op_ids : []
    );
    // When the server lacks per-op idempotency support, treat a successful
    // 2xx as "all ops in batch applied" so retries don't accumulate.
    const toDelete = applied.size > 0
      ? built.clientOpIds.filter((id) => applied.has(id))
      : built.clientOpIds;
    const failed = built.clientOpIds.filter((id) => !toDelete.includes(id));

    await deleteOps(toDelete);
    if (failed.length > 0) {
      const errMap: Record<string, string> = {};
      const opErrors = (response as { op_errors?: Record<string, string> })?.op_errors;
      if (opErrors) {
        for (const id of failed) {
          if (opErrors[id]) errMap[id] = opErrors[id];
        }
      }
      await markFailed(failed, errMap);
    }
  } catch (error) {
    if (isAuthRequiredError(error)) {
      // Auth required: leave ops in place; they'll drain after sign-in.
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const errMap: Record<string, string> = {};
    for (const id of built.clientOpIds) errMap[id] = message;
    await markFailed(built.clientOpIds, errMap);
  }
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
