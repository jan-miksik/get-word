import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResponse, SyncReviewEventItem } from '@/features/sync/types';

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

import { enqueueOp } from '@/lib/local-first/enqueue';
import { useProgress } from '../progress';
import { STAGES } from '@/lib/words';

const REVIEW_EVENT_OUTBOX_KEY = 'get_word_review_event_outbox';

function seedOutbox(events: SyncReviewEventItem[]): void {
  localStorage.setItem(REVIEW_EVENT_OUTBOX_KEY, JSON.stringify(events));
}

function event(
  wordId: string,
  action: SyncReviewEventItem['action'],
  clientCreatedAt = 1_900_000_000_000,
): SyncReviewEventItem {
  return {
    client_event_id: `evt-${wordId}-${action}-${clientCreatedAt}`,
    word_id: wordId,
    action,
    client_created_at: clientCreatedAt,
  };
}

function serverProgress(
  rows: Array<{
    id: string;
    stage: number;
    knownCount?: number;
    unknownCount?: number;
    lastKnownAt?: string | null;
    lastUnknownAt?: string | null;
    nextDueAt?: string | null;
  }>,
): NonNullable<SyncResponse['progress']> {
  const map: NonNullable<SyncResponse['progress']> = {};
  for (const row of rows) {
    map[row.id] = {
      stageIndex: row.stage,
      knownCount: row.knownCount ?? 0,
      unknownCount: row.unknownCount ?? 0,
      lastKnownAt: row.lastKnownAt ?? null,
      lastUnknownAt: row.lastUnknownAt ?? null,
      nextDueAt: row.nextDueAt ?? null,
    } as NonNullable<SyncResponse['progress']>[string];
  }
  return map;
}

describe('useProgress outbox-aware merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('replays pending review events on top of a full server snapshot', () => {
    // User marked w001 "known" while the POST is still in flight. Server's
    // snapshot reflects the prior stage (3); without the outbox replay the UI
    // would visibly revert from optimistic 4 → 3.
    seedOutbox([event('w001', 'known')]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{ id: 'w001', stage: 3 }]));
    });

    expect(result.current.progress.w001.stageIndex).toBe(4);
    expect(result.current.progress.w001.knownCount).toBe(1);
  });

  it('replays pending events on top of delta merges', () => {
    seedOutbox([event('w001', 'known')]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{ id: 'w001', stage: 2 }]));
    });
    // A subsequent delta returning the same word at the old stage (another
    // device's stale write, or our own POST response arriving out of order)
    // must not revert the user-visible state.
    act(() => {
      // Reseed because the in-flight event hasn't been acked yet.
      seedOutbox([event('w001', 'known')]);
      result.current.applyServerProgress(serverProgress([{ id: 'w001', stage: 2 }]));
    });

    expect(result.current.progress.w001.stageIndex).toBe(3);
  });

  it('applies multiple queued events in order', () => {
    // Two rapid "known" clicks while the POST is still debouncing. Outbox
    // ordering must be preserved so the server-side composition (event 1 then
    // event 2) matches the client-side optimistic state.
    seedOutbox([
      event('w001', 'known', 1_900_000_000_000),
      event('w001', 'known', 1_900_000_000_500),
    ]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{ id: 'w001', stage: 0 }]));
    });

    expect(result.current.progress.w001.stageIndex).toBe(2);
    expect(result.current.progress.w001.knownCount).toBe(2);
  });

  it('keeps a retired word retired when it is answered right again', () => {
    // Practise-ahead can still surface a word the learner retired as "fully
    // known". Getting it right must not quietly book another 60 days.
    seedOutbox([event('w001', 'known')]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(
        serverProgress([{ id: 'w001', stage: STAGES.length - 1, nextDueAt: null }]),
      );
    });

    expect(result.current.progress.w001.stageIndex).toBe(STAGES.length - 1);
    expect(result.current.progress.w001.nextDueAt).toBeUndefined();
  });

  it('returns a retired word to the rotation when it is answered wrong', () => {
    seedOutbox([event('w001', 'unknown')]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(
        serverProgress([{ id: 'w001', stage: STAGES.length - 1, nextDueAt: null }]),
      );
    });

    expect(result.current.progress.w001.stageIndex).toBe(STAGES.length - 2);
    expect(result.current.progress.w001.nextDueAt).toBeGreaterThan(0);
  });

  it('counts a same-stage review and enqueues it as a durable review event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{
        id: 'w001',
        stage: 3,
        knownCount: 2,
        unknownCount: 1,
        nextDueAt: '2026-08-25T11:00:00.000Z',
      }]));
      result.current.markStay('w001');
    });

    expect(result.current.progress.w001).toMatchObject({
      stageIndex: 3,
      knownCount: 3,
      unknownCount: 1,
      lastKnownAt: Date.parse('2026-08-25T12:00:00.000Z'),
      nextDueAt: Date.parse('2026-08-28T12:00:00.000Z'),
    });
    const queued = JSON.parse(localStorage.getItem(REVIEW_EVENT_OUTBOX_KEY) ?? '[]');
    expect(queued).toEqual([
      expect.objectContaining({ word_id: 'w001', action: 'stay' }),
    ]);
    vi.useRealTimers();
  });

  it('does not replay an older pending review event over a newer custom progress row', () => {
    seedOutbox([event('w001', 'known', 1_900_000_000_000)]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(
        serverProgress([
          {
            id: 'w001',
            stage: 1,
            knownCount: 1,
            lastKnownAt: new Date(1_900_000_005_000).toISOString(),
            nextDueAt: new Date(1_900_000_305_000).toISOString(),
          },
        ]),
      );
    });

    expect(result.current.progress.w001.stageIndex).toBe(1);
    expect(result.current.progress.w001.nextDueAt).toBe(1_900_000_305_000);
  });

  it('leaves words without pending events untouched', () => {
    seedOutbox([event('w002', 'known')]);

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(
        serverProgress([
          { id: 'w001', stage: 5 },
          { id: 'w002', stage: 3 },
        ]),
      );
    });

    expect(result.current.progress.w001.stageIndex).toBe(5);
    expect(result.current.progress.w002.stageIndex).toBe(4);
  });

  it('does nothing extra when the outbox is empty', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{ id: 'w001', stage: 4 }]));
    });

    expect(result.current.progress.w001.stageIndex).toBe(4);
  });

  it('enqueues custom stage selections immediately', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.setCustomStage('w001', 3);
    });

    expect(enqueueOp).toHaveBeenCalledWith({
      entity: 'progress',
      opType: 'upsert',
      payload: expect.objectContaining({
        word_id: 'w001',
        stage_index: 3,
        known_count: 1,
        client_updated_at: expect.any(Number),
      }),
      legacyPayload: {
        progress: [
          expect.objectContaining({
            word_id: 'w001',
            stage_index: 3,
            known_count: 1,
            client_updated_at: expect.any(Number),
          }),
        ],
      },
    });
  });

  it('reinforces a known word without changing its SRS stage or due date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{
        id: 'w001',
        stage: 1,
        knownCount: 1,
        nextDueAt: '2026-08-25T12:03:00.000Z',
      }]));
      result.current.setCustomStage('w001', 1, { countAsKnown: true });
    });

    expect(result.current.progress.w001).toMatchObject({
      stageIndex: 1,
      knownCount: 2,
      unknownCount: 0,
      lastKnownAt: Date.parse('2026-08-25T12:00:00.000Z'),
      nextDueAt: Date.parse('2026-08-25T12:03:00.000Z'),
    });
    expect(enqueueOp).toHaveBeenLastCalledWith(expect.objectContaining({
      entity: 'progress',
      opType: 'upsert',
      payload: expect.objectContaining({
        stage_index: 1,
        known_count: 2,
        next_due_at: Date.parse('2026-08-25T12:03:00.000Z'),
      }),
    }));
    vi.useRealTimers();
  });

  it('records a failed reinforcement without demoting or rescheduling the word', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(serverProgress([{
        id: 'w001',
        stage: 1,
        knownCount: 1,
        nextDueAt: '2026-08-25T12:03:00.000Z',
      }]));
      result.current.setCustomStage('w001', 1, { countAsUnknown: true });
    });

    expect(result.current.progress.w001).toMatchObject({
      stageIndex: 1,
      knownCount: 1,
      unknownCount: 1,
      lastUnknownAt: Date.parse('2026-08-25T12:00:00.000Z'),
      nextDueAt: Date.parse('2026-08-25T12:03:00.000Z'),
    });
    vi.useRealTimers();
  });

  it('randomizes the covered language and keeps it stable through rerenders', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerProgress(
        serverProgress([{ id: 'w001', stage: 1, knownCount: 1 }]),
      );
    });

    expect(result.current.getWordDisplayMode('w001')).toBe(0);
    expect(result.current.getWordDisplayMode('w001')).toBe(0);
    expect(random).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.applyServerProgress(
        serverProgress([{ id: 'w001', stage: 2, knownCount: 2 }]),
      );
    });

    expect(result.current.getWordDisplayMode('w001')).toBe(1);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
