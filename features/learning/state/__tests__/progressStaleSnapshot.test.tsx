import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResponse } from '@/features/sync/types';

vi.mock('@/lib/local-first/enqueue', () => ({
  enqueueOp: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/sync-coordinator', () => ({
  requestSync: vi.fn(),
}));

vi.mock('@/lib/tab-sync', () => ({
  postTabMessage: vi.fn(),
  subscribeTabMessages: vi.fn(() => () => {}),
}));

import { useProgress } from '../progress';

const NOW = 1_900_000_000_000;
const REVIEW_EVENT_OUTBOX_KEY = 'get_word_review_event_outbox';

type WireProgress = NonNullable<SyncResponse['progress']>;

function payload(
  progress: WireProgress,
  options: { isDelta?: boolean } = {},
): SyncResponse {
  return {
    success: true,
    is_delta: options.isDelta ?? false,
    user: { id: 'user-1' },
    progress,
    memory_hooks: {},
    category_filters: [],
  } as unknown as SyncResponse;
}

function row(fields: {
  stage: number;
  knownCount?: number;
  lastKnownAt?: string | null;
  nextDueAt?: string | null;
}): WireProgress[string] {
  return {
    id: 'row',
    userId: 'user-1',
    wordId: 'w001',
    wordListItemId: null,
    stageIndex: fields.stage,
    knownCount: fields.knownCount ?? 0,
    unknownCount: 0,
    lastKnownAt: fields.lastKnownAt ?? null,
    lastUnknownAt: null,
    nextDueAt: fields.nextDueAt ?? null,
    createdAt: new Date(NOW - 86_400_000).toISOString(),
    updatedAt: new Date(NOW - 86_400_000).toISOString(),
  };
}

/**
 * Reproduce the state a device is in right after the drainer's POST was
 * acknowledged: the review is applied locally, but the outbox entry that used
 * to mask stale server rows is gone.
 */
function renderWithDrainedReview() {
  const isUpdatingFromServerRef = { current: false };
  const hook = renderHook(() => useProgress(true, isUpdatingFromServerRef));
  act(() => {
    hook.result.current.markKnown('w001');
  });
  localStorage.removeItem(REVIEW_EVENT_OUTBOX_KEY);
  return hook;
}

describe('progress reconciliation against stale server payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the local row when a full snapshot predates the review', () => {
    const { result } = renderWithDrainedReview();
    expect(result.current.progress.w001.stageIndex).toBe(1);

    // A GET issued before the POST committed: the server still reports stage 0
    // with no review recorded, and its nextDueAt is long past.
    const reconciled = result.current.reconcileServerProgress(
      payload({ w001: row({ stage: 0, nextDueAt: new Date(NOW - 1000).toISOString() }) }),
    );
    act(() => {
      result.current.applyServerProgress(reconciled.progress);
    });

    expect(result.current.progress.w001.stageIndex).toBe(1);
    expect(result.current.progress.w001.nextDueAt).toBeGreaterThan(NOW);
  });

  it('keeps a first-ever review that a full snapshot omits entirely', () => {
    const { result } = renderWithDrainedReview();

    const reconciled = result.current.reconcileServerProgress(payload({}));
    act(() => {
      result.current.applyServerProgress(reconciled.progress);
    });

    expect(result.current.progress.w001.stageIndex).toBe(1);
    expect(reconciled.progress.w001.lastKnownAt).toBe(new Date(NOW).toISOString());
  });

  it('keeps the local row when a delta carries a stale copy of it', () => {
    const { result } = renderWithDrainedReview();

    const reconciled = result.current.reconcileServerProgress(
      payload({ w001: row({ stage: 0 }) }, { isDelta: true }),
    );
    act(() => {
      result.current.mergeServerProgress(reconciled.progress);
    });

    expect(result.current.progress.w001.stageIndex).toBe(1);
  });

  it('yields to a server row that is newer than the local one', () => {
    const { result } = renderWithDrainedReview();

    // Another device reviewed the same word a minute later.
    const laterAt = new Date(NOW + 60_000).toISOString();
    const reconciled = result.current.reconcileServerProgress(
      payload({ w001: row({ stage: 4, knownCount: 4, lastKnownAt: laterAt }) }),
    );
    act(() => {
      result.current.applyServerProgress(reconciled.progress);
    });

    expect(result.current.progress.w001.stageIndex).toBe(4);
  });

  it('leaves rows the user never touched to the server', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));
    act(() => {
      result.current.applyServerProgress({ w001: row({ stage: 5 }) });
    });

    // No local review happened, so an empty snapshot is authoritative — a
    // server-side reset must still be able to land.
    const reconciled = result.current.reconcileServerProgress(payload({}));
    expect(reconciled.progress).toEqual({});
    act(() => {
      result.current.applyServerProgress(reconciled.progress);
    });
    expect(result.current.progress).toEqual({});
  });
});
