import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppliedReviewEvents,
  enqueueReviewEvent,
  getPendingReviewEvents,
  type ReviewEventPayload,
} from '../review-events';

const mockSyncUserData = vi.fn();

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

import {
  __resetSyncCoordinatorForTests,
  flushPendingSync,
  getSyncStatus,
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
});
