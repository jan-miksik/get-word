import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WordStream } from '@/features/learning/hooks/useWordStream';
import { readSessionPlan } from '../storage';
import { useSessionPlan } from '../useSessionPlan';

const scope = { dayKey: '2026-08-20', scopeKey: 'pair:cs:vi|categories:all', goalVersionId: 'goal-1' };
const goal = {
  id: 'goal-1', effectiveFromDay: scope.dayKey, enabled: true, mode: 'minutes' as const, daysPerWeek: 4,
  minutesPerDay: 10, wordsPerDay: 5, newWordsPerDay: null, preset: 'medium' as const,
  pacing: { revealMode: 'scratch' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } },
};
const word = (id: string) => ({ id, cz: id, vi: id, en: '', category: [] });
const stream: WordStream = {
  priorityWords: [], priorityDueCount: 0, dueWords: [word('review')], newWords: [word('new')], settlingWords: [],
};

describe('useSessionPlan persistence', () => {
  beforeEach(() => localStorage.clear());

  it('does not freeze a plan before session data is ready, then persists it once ready', async () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useSessionPlan({
        stream, progress: {}, goal, isSessionDataReady: ready,
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
        stream, progress: {}, goal, isSessionDataReady: true, continueAnyway,
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
        stream: currentStream, progress: {}, goal, isSessionDataReady: true,
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
      stream, progress: {}, goal, isSessionDataReady: true,
      dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
    }));
    await waitFor(() => expect(readSessionPlan(scope)?.blocks).toHaveLength(3));
    first.unmount();

    const emptyStream: WordStream = {
      priorityWords: [], priorityDueCount: 0, dueWords: [], newWords: [], settlingWords: [],
    };
    const second = renderHook(() => useSessionPlan({
      stream: emptyStream, progress: {}, goal, isSessionDataReady: true,
      dayKey: scope.dayKey, timezone: 'UTC', scopeKey: scope.scopeKey,
    }));

    await waitFor(() => expect(second.result.current.dailyPlan?.blocks).toHaveLength(3));
  });
});
