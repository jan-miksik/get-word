'use client';

import { getDeviceId } from '@/lib/device-id';
import { getPendingReviewEvents } from '@/features/sync/review-event-outbox';
import type { SyncReviewEventItem } from '@/features/sync/types';
import { getSessionId } from '@/lib/session-id';
import { isAuthRequiredError, syncUserData } from '@/lib/sync';
import { isLocalFirstAvailableSync } from '@/lib/local-first/availability';

export type SyncReason =
  | 'app_open'
  | 'review_event'
  | 'focus'
  | 'blur'
  | 'visible'
  | 'hidden'
  | 'pagehide'
  | 'online'
  | 'periodic'
  | 'manual';

export interface SyncStatus {
  pendingCount: number;
  isSyncing: boolean;
  isRetrying: boolean;
  lastSyncedAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  retryCount: number;
  nextRetryAt: number | null;
  lastReason: SyncReason | null;
}

type Listener = (status: SyncStatus) => void;

const LAST_SYNCED_AT_KEY = 'get-word-last-synced-at';
const NORMAL_SYNC_DEBOUNCE_MS = 7_500;
const PERIODIC_SYNC_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [10_000, 30_000, 2 * 60_000, 5 * 60_000];
const KEEPALIVE_MAX_BYTES = 60 * 1024;

let syncTimer: number | null = null;
let retryTimer: number | null = null;
let periodicTimer: number | null = null;
let lifecycleInstalled = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<Listener>();

let status: SyncStatus = {
  pendingCount: 0,
  isSyncing: false,
  isRetrying: false,
  lastSyncedAt: readLastSyncedAt(),
  lastAttemptAt: null,
  lastError: null,
  retryCount: 0,
  nextRetryAt: null,
  lastReason: null,
};

function readLastSyncedAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = Number(window.localStorage.getItem(LAST_SYNCED_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastSyncedAt(value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SYNCED_AT_KEY, String(value));
  } catch {
    // Last-sync metadata is useful but not required for correctness.
  }
}

function emit(patch: Partial<SyncStatus> = {}): void {
  status = {
    ...status,
    ...patch,
    pendingCount: getPendingReviewEvents().length,
  };
  listeners.forEach((listener) => listener(status));
}

function clearTimer(timer: number | null): void {
  if (timer !== null && typeof window !== 'undefined') {
    window.clearTimeout(timer);
  }
}

function clearRetryTimer(): void {
  clearTimer(retryTimer);
  retryTimer = null;
}

function scheduleRetry(reason: SyncReason): void {
  if (typeof window === 'undefined') return;
  const retryCount = Math.min(status.retryCount + 1, RETRY_DELAYS_MS.length);
  const delay = RETRY_DELAYS_MS[retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const nextRetryAt = Date.now() + delay;

  clearRetryTimer();
  emit({ isRetrying: true, retryCount, nextRetryAt, lastReason: reason });
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushPendingSync('manual');
  }, delay);
}

async function normalFlush(reason: SyncReason): Promise<void> {
  // When IndexedDB is available the local-first drainer owns review-event
  // POSTs. Running normalFlush in parallel would race the drainer: both POSTs
  // return full snapshots and the later one can clobber a fresh optimistic
  // update applied between the two responses. We keep this path alive only as
  // a fallback for the IDB-unavailable case (private browsing, storage
  // quotas, old browsers) — the drainer never runs there.
  if (isLocalFirstAvailableSync()) {
    emit({ lastReason: reason, lastError: null });
    return;
  }
  const pending = getPendingReviewEvents();
  if (pending.length === 0) {
    emit({ lastReason: reason, lastError: null });
    return;
  }
  if (inFlight) return inFlight;

  const startedAt = Date.now();
  emit({
    isSyncing: true,
    isRetrying: false,
    lastAttemptAt: startedAt,
    lastError: null,
    lastReason: reason,
  });

  inFlight = syncUserData({ review_events: pending })
    .then(() => {
      const syncedAt = Date.now();
      writeLastSyncedAt(syncedAt);
      clearRetryTimer();
      emit({
        isSyncing: false,
        isRetrying: false,
        lastSyncedAt: syncedAt,
        lastError: null,
        retryCount: 0,
        nextRetryAt: null,
        lastReason: reason,
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      emit({
        isSyncing: false,
        lastError: message,
        lastReason: reason,
      });
      if (!isAuthRequiredError(error)) {
        scheduleRetry(reason);
      }
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function makeUrgentPayload(events: SyncReviewEventItem[]): Blob | null {
  const payload = JSON.stringify({
    deviceId: getDeviceId(),
    sessionId: getSessionId(),
    review_events: events,
  });
  if (new Blob([payload]).size > KEEPALIVE_MAX_BYTES) return null;
  return new Blob([payload], { type: 'application/json' });
}

function urgentFlush(reason: SyncReason): void {
  const pending = getPendingReviewEvents();
  if (pending.length === 0 || typeof fetch === 'undefined') {
    emit({ lastReason: reason });
    return;
  }

  const body = makeUrgentPayload(pending);
  if (!body) {
    emit({ lastError: 'Pending sync payload is too large for urgent flush', lastReason: reason });
    return;
  }

  emit({ lastAttemptAt: Date.now(), lastReason: reason });

  void fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  })
    .then(async (response) => {
      if (!response.ok) return;
      const syncedAt = Date.now();
      writeLastSyncedAt(syncedAt);
      emit({ lastSyncedAt: syncedAt, lastError: null, retryCount: 0, nextRetryAt: null });
    })
    .catch(() => {
      // Closing/hiding flushes are best-effort. The local outbox remains intact.
    });
}

export function requestSync(reason: SyncReason): void {
  if (typeof window === 'undefined') return;
  emit({ lastReason: reason });
  if (getPendingReviewEvents().length === 0) return;
  // When the IDB drainer owns review-event POSTs the coordinator's normalFlush
  // is a no-op anyway; skip scheduling to avoid the wasted timer and to keep
  // the two systems' debounce windows from interleaving in surprising ways.
  if (isLocalFirstAvailableSync()) return;

  clearTimer(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void flushPendingSync(reason);
  }, NORMAL_SYNC_DEBOUNCE_MS);
}

export function flushPendingSync(
  reason: SyncReason,
  options: { urgent?: boolean } = {}
): Promise<void> | void {
  clearTimer(syncTimer);
  syncTimer = null;

  if (options.urgent) {
    urgentFlush(reason);
    return;
  }
  return normalFlush(reason);
}

export function getSyncStatus(): SyncStatus {
  status = {
    ...status,
    pendingCount: getPendingReviewEvents().length,
  };
  return status;
}

export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(getSyncStatus());
  return () => listeners.delete(listener);
}

export function installSyncLifecycle(): () => void {
  if (typeof window === 'undefined' || lifecycleInstalled) {
    return () => undefined;
  }

  lifecycleInstalled = true;

  const onFocus = () => void flushPendingSync('focus');
  const onBlur = () => flushPendingSync('blur', { urgent: true });
  const onOnline = () => void flushPendingSync('online');
  const onPageShow = () => void flushPendingSync('app_open');
  const onPageHide = () => flushPendingSync('pagehide', { urgent: true });
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void flushPendingSync('visible');
    } else {
      flushPendingSync('hidden', { urgent: true });
    }
  };

  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('online', onOnline);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  periodicTimer = window.setInterval(() => {
    if (getPendingReviewEvents().length > 0) {
      void flushPendingSync('periodic');
    } else {
      emit({ lastReason: 'periodic' });
    }
  }, PERIODIC_SYNC_MS);

  requestSync('app_open');

  return () => {
    lifecycleInstalled = false;
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    clearTimer(syncTimer);
    clearRetryTimer();
    if (periodicTimer !== null) {
      window.clearInterval(periodicTimer);
      periodicTimer = null;
    }
  };
}

export function __resetSyncCoordinatorForTests(): void {
  clearTimer(syncTimer);
  clearRetryTimer();
  if (periodicTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(periodicTimer);
  }
  syncTimer = null;
  retryTimer = null;
  periodicTimer = null;
  lifecycleInstalled = false;
  inFlight = null;
  listeners.clear();
  status = {
    pendingCount: getPendingReviewEvents().length,
    isSyncing: false,
    isRetrying: false,
    lastSyncedAt: readLastSyncedAt(),
    lastAttemptAt: null,
    lastError: null,
    retryCount: 0,
    nextRetryAt: null,
    lastReason: null,
  };
}
