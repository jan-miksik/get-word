import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WordStream } from '@/features/learning/hooks/useWordStream';
import type { ProgressData } from '@/features/sync/contracts';
import { readSessionPlan, storeSessionPlan } from '../storage';
import { extendTimeSessionPlan, extendWordsSessionPlan, useSessionPlan } from '../useSessionPlan';

const scope = { dayKey: '2026-08-20', scopeKey: 'pair:cs:vi|categories:all', goalVersionId: 'goal-1' };
const goal = {
  id: 'goal-1', effectiveFromDay: scope.dayKey, enabled: true, mode: 'minutes' as const, daysPerWeek: 4, weekdays: null,
  minutesPerDay: 10, wordsPerDay: 5, newWordsPerDay: null, preset: 'medium' as const,
  pacing: { revealMode: 'scratch' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } },
};
const word = (id: string) => ({ id, cz: id, vi: id, en: '', category: [] });
const stream: WordStream = {
  priorityWords: [], priorityDueCount: 0, dueWords: [word('review')], newWords: [word('new')], settlingWords: [],
};
const reviewProgress: Record<string, ProgressData> = {
  review: { stageIndex: 1, knownCount: 1, unknownCount: 0, introducedAt: 1, nextDueAt: 1 },
};

describe('useSessionPlan persistence', () => {
  beforeEach(() => localStorage.clear());

  it('does not freeze a plan before session data is ready, then persists it once ready', async () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useSessionPlan({
        stream, progress: reviewProgress, goal, isSessionDataReady: ready,
        dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
      }),
      { initialProps: { ready: false } },
    );
    expect(result.current.dailyPlan).toBeNull();
    expect(readSessionPlan(scope)).toBeNull();

    rerender({ ready: true });
    await waitFor(() => expect(readSessionPlan(scope)?.blocks).toHaveLength(3));
    expect(result.current.dailyPlan?.blocks).toHaveLength(3);
  });

  it('keeps the frozen plan available while overflow uses the unbounded stream', async () => {
    const { result, rerender } = renderHook(
      ({ continueAnyway }) => useSessionPlan({
        stream, progress: reviewProgress, goal, isSessionDataReady: true, continueAnyway,
        dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
      }),
      { initialProps: { continueAnyway: false } },
    );
    await waitFor(() => expect(result.current.dailyPlan?.blocks).toHaveLength(3));
    rerender({ continueAnyway: true });
    expect(result.current.streamMode).toBe('overflow');
    expect(result.current.dailyPlan?.blocks).toHaveLength(3);
  });

  it('keeps the frozen plan after the last live word leaves the stream', async () => {
    const emptyStream: WordStream = {
      priorityWords: [], priorityDueCount: 0, dueWords: [], newWords: [], settlingWords: [],
    };
    const { result, rerender } = renderHook(
      ({ currentStream }) => useSessionPlan({
        stream: currentStream, progress: reviewProgress, goal, isSessionDataReady: true,
        dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
      }),
      { initialProps: { currentStream: stream } },
    );
    await waitFor(() => expect(result.current.dailyPlan?.blocks).toHaveLength(3));

    rerender({ currentStream: emptyStream });

    expect(result.current.dailyPlan?.blocks).toHaveLength(3);
  });

  it('recovers a completed frozen plan after reload when the live stream is empty', async () => {
    const first = renderHook(() => useSessionPlan({
      stream, progress: reviewProgress, goal, isSessionDataReady: true,
      dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
    }));
    await waitFor(() => expect(readSessionPlan(scope)?.blocks).toHaveLength(3));
    first.unmount();

    const emptyStream: WordStream = {
      priorityWords: [], priorityDueCount: 0, dueWords: [], newWords: [], settlingWords: [],
    };
    const second = renderHook(() => useSessionPlan({
      stream: emptyStream, progress: reviewProgress, goal, isSessionDataReady: true,
      dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
    }));

    await waitFor(() => expect(second.result.current.dailyPlan?.blocks).toHaveLength(3));
  });

  it('discards a cached plan that labels an unseen word as review', async () => {
    const freshOnly: WordStream = {
      priorityWords: [], priorityDueCount: 0, dueWords: [], newWords: [word('fresh')], settlingWords: [],
    };
    storeSessionPlan(scope, {
      enabled: true,
      sessionItemCap: 2,
      priorityIds: [],
      dueIds: ['fresh'],
      newIds: [],
      deferredDueCount: 0,
      shortfall: 0,
      newShortfall: 0,
      reason: 'normal',
      blocks: [{ key: 'review-0', kind: 'review', ids: ['fresh'] }],
    });

    const { result } = renderHook(() => useSessionPlan({
      stream: freshOnly, progress: {}, goal, isSessionDataReady: true,
      dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
    }));

    await waitFor(() => expect(result.current.dailyPlan?.blocks[0]?.kind).toBe('new'));
    expect(readSessionPlan(scope)?.blocks[0]?.kind).toBe('new');
  });
});

describe('extendTimeSessionPlan', () => {
  it('fills a missing new phase and its reinforcement without replacing completed work', () => {
    const initial = {
      enabled: true,
      sessionItemCap: 5,
      priorityIds: [],
      dueIds: ['review'],
      newIds: [],
      deferredDueCount: 0,
      shortfall: 4,
      newShortfall: 2,
      reason: 'normal' as const,
      blocks: [{ key: 'review-0', kind: 'review' as const, ids: ['review'], phase: 0 }],
      timePhaseShares: [1 / 3, 1 / 3, 1 / 3],
      timePhaseKinds: ['review', 'new', 'review'] as Array<'review' | 'new'>,
    };

    const extended = extendTimeSessionPlan(initial, {
      priorityWords: [],
      newWords: [word('new-1'), word('new-2'), word('new-3')],
    }, {});

    expect(extended.newIds).toEqual(['new-1', 'new-2']);
    expect(extended.blocks).toEqual([
      { key: 'review-0', kind: 'review', ids: ['review'], phase: 0 },
      { key: 'new-0', kind: 'new', ids: ['new-1', 'new-2'], phase: 1 },
      {
        key: 'review-1', kind: 'review', ids: ['new-1', 'new-2'],
        pass: 2, phase: 2, reinforcement: true,
      },
    ]);
    expect(extended).toMatchObject({ shortfall: 0, newShortfall: 0 });
    expect(extended.answerBaseline).toEqual({ 'new-1': 0, 'new-2': 0 });
  });
});

describe('extendWordsSessionPlan', () => {
  const wordsPlan = () => ({
    enabled: true,
    sessionItemCap: 12,
    priorityIds: [],
    dueIds: [],
    newIds: ['new-1'],
    deferredDueCount: 0,
    shortfall: 2,
    newShortfall: 2,
    newTarget: 3,
    reviewTarget: 9,
    reason: 'normal' as const,
    blocks: [
      { key: 'new-0', kind: 'new' as const, ids: ['new-1'] },
      { key: 'review-0', kind: 'review' as const, ids: ['new-1'], pass: 2, reinforcement: true as const },
    ],
  });

  it('adds words committed after the plan froze to the introduction and its second pass', () => {
    const extended = extendWordsSessionPlan(wordsPlan(), {
      priorityWords: [],
      newWords: [word('new-1'), word('new-2'), word('new-3'), word('new-4')],
    }, {});

    expect(extended.newIds).toEqual(['new-1', 'new-2', 'new-3']);
    expect(extended.blocks).toEqual([
      { key: 'new-0', kind: 'new', ids: ['new-1', 'new-2', 'new-3'] },
      {
        key: 'review-0', kind: 'review', ids: ['new-1', 'new-2', 'new-3'],
        pass: 2, reinforcement: true,
      },
    ]);
    expect(extended).toMatchObject({ shortfall: 0, newShortfall: 0 });
  });

  it('creates the introduction blocks when the frozen plan started with reviews only', () => {
    const extended = extendWordsSessionPlan({
      ...wordsPlan(),
      newIds: [],
      blocks: [{ key: 'review-0', kind: 'review', ids: ['due-1'] }],
    }, {
      priorityWords: [],
      newWords: [word('new-1'), word('new-2')],
    }, {});

    expect(extended.blocks).toEqual([
      { key: 'review-0', kind: 'review', ids: ['due-1'] },
      { key: 'new-0', kind: 'new', ids: ['new-1', 'new-2'] },
      {
        key: 'review-1', kind: 'review', ids: ['new-1', 'new-2'],
        pass: 2, reinforcement: true,
      },
    ]);
  });

  it('leaves an introduction that is already under way alone', () => {
    const progress = { 'new-1': { knownCount: 1, unknownCount: 0, stageIndex: 1, introducedAt: 1 } };
    const plan = wordsPlan();
    const extended = extendWordsSessionPlan(plan, {
      priorityWords: [],
      newWords: [word('new-2'), word('new-3')],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial progress fixture
    }, progress as any);

    expect(extended).toBe(plan);
  });
});
