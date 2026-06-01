import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppliedReviewEvents,
  enqueueReviewEvent,
  getPendingReviewEvents,
  type ReviewEventPayload,
} from '../review-events';

const mockSyncUserData = vi.fn();
const mockIsLocalFirstAvailableSync = vi.fn<() => boolean>(() => false);

vi.mock('../sync', () => ({
  syncUserData: (...args: unknown[]) => mockSyncUserData(...args),
  isAuthRequiredError: () => false,
}));

vi.mock('../device-id', () => ({
  getDeviceId: () => 'device-1',
}));

vi.mock('../session-id', () => ({
  getSessionId: () => 'session-1',
}));

vi.mock('../local-first/availability', () => ({
  isLocalFirstAvailableSync: () => mockIsLocalFirstAvailableSync(),
  // The drainer (triggered by enqueueReviewEvent → scheduleDrain) calls this
  // asynchronously. Return false so the drainer no-ops — these tests are
  // about the coordinator, and we don't want a real IDB path firing.
  ensureLocalFirstAvailability: async () => false,
}));

import {
  __resetSyncCoordinatorForTests,
  flushPendingSync,
  getSyncStatus,
  installSyncLifecycle,
  requestSync,
} from '../sync-coordinator';

const event1: ReviewEventPayload = {
  client_event_id: 'event-1',
  word_id: 'w001',
  action: 'known',
  client_created_at: 1776944510000,
};

const event2: ReviewEventPayload = {
  client_event_id: 'event-2',
  word_id: 'w002',
  action: 'unknown',
  client_created_at: 1776944511000,
};

describe('sync coordinator', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    mockSyncUserData.mockReset();
    mockIsLocalFirstAvailableSync.mockReset();
    mockIsLocalFirstAvailableSync.mockReturnValue(false);
    __resetSyncCoordinatorForTests();
  });

  afterEach(() => {
    __resetSyncCoordinatorForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('normal sync clears only server-acknowledged review events', async () => {
    enqueueReviewEvent(event1);
    enqueueReviewEvent(event2);
    mockSyncUserData.mockImplementation(async () => {
      clearAppliedReviewEvents(['event-1']);
      return { success: true, applied_review_event_ids: ['event-1'] };
    });

    await flushPendingSync('manual');

    expect(mockSyncUserData).toHaveBeenCalledWith({
      review_events: [event1, event2],
    });
    expect(getPendingReviewEvents()).toEqual([event2]);
    expect(getSyncStatus().pendingCount).toBe(1);
  });

  it('urgent keepalive flush does not clear the local outbox', async () => {
    enqueueReviewEvent(event1);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, applied_review_event_ids: ['event-1'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    flushPendingSync('pagehide', { urgent: true });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith('/api/sync', expect.objectContaining({
      method: 'POST',
      keepalive: true,
    }));
    expect(getPendingReviewEvents()).toEqual([event1]);
  });

  it('debounces requested sync and retries failed normal syncs', async () => {
    enqueueReviewEvent(event1);
    mockSyncUserData.mockRejectedValue(new Error('network down'));

    requestSync('review_event');
    expect(mockSyncUserData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(7_500);
    await vi.waitFor(() => expect(mockSyncUserData).toHaveBeenCalledTimes(1));

    const failedStatus = getSyncStatus();
    expect(failedStatus.isRetrying).toBe(true);
    expect(failedStatus.retryCount).toBe(1);
    expect(failedStatus.nextRetryAt).not.toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(mockSyncUserData).toHaveBeenCalledTimes(2));
  });

  it('does not POST review events when the IDB drainer is available', async () => {
    // When IndexedDB is available the local-first drainer owns the
    // review-event POST path. The coordinator must stay completely silent for
    // normal syncs so the two systems can't race and overwrite each other's
    // snapshot responses. The urgent (pagehide) path is tested separately
    // and is intentionally still active even with IDB available.
    mockIsLocalFirstAvailableSync.mockReturnValue(true);
    enqueueReviewEvent(event1);

    requestSync('review_event');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockSyncUserData).not.toHaveBeenCalled();
    // Event should still be in the local outbox — the drainer will pick it up.
    expect(getPendingReviewEvents()).toEqual([event1]);
  });

  it('falls back to coordinator POSTs when IDB is unavailable', async () => {
    // Private browsing / quota-exceeded / Safari-with-cookies-disabled all
    // make IDB unavailable. The legacy coordinator path must still flush
    // review events so users on those browsers don't silently lose progress.
    mockIsLocalFirstAvailableSync.mockReturnValue(false);
    enqueueReviewEvent(event1);
    mockSyncUserData.mockResolvedValue({ success: true, applied_review_event_ids: ['event-1'] });

    requestSync('review_event');
    await vi.advanceTimersByTimeAsync(7_500);
    await vi.waitFor(() => expect(mockSyncUserData).toHaveBeenCalledTimes(1));

    expect(mockSyncUserData).toHaveBeenCalledWith({ review_events: [event1] });
  });

  it('treats pageshow as an app-open sync point', async () => {
    mockIsLocalFirstAvailableSync.mockReturnValue(false);
    enqueueReviewEvent(event1);
    mockSyncUserData.mockResolvedValue({ success: true, applied_review_event_ids: ['event-1'] });

    const cleanup = installSyncLifecycle();
    window.dispatchEvent(new Event('pageshow'));

    await vi.waitFor(() => expect(mockSyncUserData).toHaveBeenCalledWith({
      review_events: [event1],
    }));
    cleanup();
  });
});
