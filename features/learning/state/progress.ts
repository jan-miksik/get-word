'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressData, SyncResponse } from '@/lib/sync';
import { STAGES } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function padTimePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatLogDateTime(timestamp?: number) {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    padTimePart(date.getMonth() + 1),
    padTimePart(date.getDate()),
    padTimePart(date.getHours()),
    padTimePart(date.getMinutes()),
  ].join('-');
}

function formatRelativeFromNow(timestamp?: number, now = Date.now()) {
  if (!timestamp) return null;

  const diffMs = timestamp - now;
  const absDiffMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  let value: number;
  let unit: string;

  if (absDiffMs >= dayMs) {
    value = Math.round(absDiffMs / dayMs);
    unit = value === 1 ? 'day' : 'days';
  } else if (absDiffMs >= hourMs) {
    value = Math.round(absDiffMs / hourMs);
    unit = value === 1 ? 'hour' : 'hours';
  } else if (absDiffMs >= minuteMs) {
    value = Math.round(absDiffMs / minuteMs);
    unit = value === 1 ? 'min' : 'mins';
  } else {
    value = Math.max(0, Math.round(absDiffMs / 1000));
    unit = value === 1 ? 'sec' : 'secs';
  }

  if (value === 0) return 'now';
  return diffMs >= 0 ? `in ${value}${unit}` : `${value}${unit} ago`;
}

function logNextDueAtCalculation(args: {
  action: 'known' | 'really-known' | 'unknown';
  wordId: string;
  previousStageIndex: number;
  nextStageIndex: number;
  intervalMs?: number;
  nextDueAt?: number;
}) {
  if (process.env.NODE_ENV === 'production') return;

  const { action, wordId, previousStageIndex, nextStageIndex, intervalMs, nextDueAt } = args;
  const now = Date.now();
  const nextDueAtIso = nextDueAt ? new Date(nextDueAt).toISOString() : null;
  const nextDueAtHuman = formatLogDateTime(nextDueAt);
  const nextDueAtFromNow = formatRelativeFromNow(nextDueAt, now);

  console.info('[progress] nextDueAt calculated', {
    action,
    wordId,
    previousStageIndex,
    nextStageIndex,
    intervalMs: intervalMs ?? null,
    nextDueAt: nextDueAt ?? null,
    nextDueAtIso,
    nextDueAtHuman,
    nextDueAtFromNow,
  });
}

export function serializeProgressForSync(progress: Record<string, ProgressData>) {
  return Object.entries(progress).map(([id, data]) => {
    const isUuid = UUID_RE.test(id);
    return {
      ...(isUuid ? { word_list_item_id: id } : { word_id: id }),
      stage_index: data.stageIndex,
      known_count: data.knownCount,
      unknown_count: data.unknownCount,
      last_known_at: data.lastKnownAt ?? null,
      last_unknown_at: data.lastUnknownAt ?? null,
      next_due_at: data.nextDueAt ?? null,
    };
  });
}

export function useProgress(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [progress, setProgress] = useState<Record<string, ProgressData>>({});
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const lastMovedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ progress: serializeProgressForSync(progress) }).catch((e) =>
      console.error('[useProgress] sync:', e)
    );
  }, [progress, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => () => {
    if (lastMovedTimeoutRef.current) clearTimeout(lastMovedTimeoutRef.current);
  }, []);

  const applyServerProgress = useCallback(
    (serverProgress: SyncResponse['progress']) => {
      if (!serverProgress || Object.keys(serverProgress).length === 0) return;
      const next: Record<string, ProgressData> = {};
      for (const [wordId, progressEntry] of Object.entries(serverProgress)) {
        next[wordId] = {
          stageIndex: progressEntry.stageIndex,
          knownCount: progressEntry.knownCount,
          unknownCount: progressEntry.unknownCount,
          lastKnownAt: progressEntry.lastKnownAt ? new Date(progressEntry.lastKnownAt).getTime() : undefined,
          lastUnknownAt: progressEntry.lastUnknownAt ? new Date(progressEntry.lastUnknownAt).getTime() : undefined,
          nextDueAt: progressEntry.nextDueAt ? new Date(progressEntry.nextDueAt).getTime() : undefined,
        };
      }
      setProgress(next);
    },
    []
  );

  const setLastMoved = useCallback((wordId: string) => {
    setLastMovedId(wordId);
    if (lastMovedTimeoutRef.current) clearTimeout(lastMovedTimeoutRef.current);
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedId(null), 1000);
  }, []);

  const updateProgress = useCallback((wordId: string, updates: Partial<ProgressData>) => {
    setProgress((prev) => {
      const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      return { ...prev, [wordId]: { ...current, ...updates } };
    });
  }, []);

  const markKnown = useCallback(
    (wordId: string) => {
      setProgress((prev) => {
        const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
        const newStageIndex = Math.min(current.stageIndex + 1, STAGES.length - 1);
        const stage = STAGES[newStageIndex];
        const nextDueAt = stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined;
        logNextDueAtCalculation({
          action: 'known',
          wordId,
          previousStageIndex: current.stageIndex,
          nextStageIndex: newStageIndex,
          intervalMs: stage.intervalMs,
          nextDueAt,
        });
        return {
          ...prev,
          [wordId]: {
            ...current,
            stageIndex: newStageIndex,
            knownCount: current.knownCount + 1,
            lastKnownAt: Date.now(),
            nextDueAt,
          },
        };
      });
      setLastMoved(wordId);
    },
    [setLastMoved]
  );

  const markReallyKnown = useCallback(
    (wordId: string) => {
      setProgress((prev) => {
        const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
        const newStageIndex = Math.min(current.stageIndex + 2, STAGES.length - 1);
        const stage = STAGES[newStageIndex];
        const nextDueAt = stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined;
        logNextDueAtCalculation({
          action: 'really-known',
          wordId,
          previousStageIndex: current.stageIndex,
          nextStageIndex: newStageIndex,
          intervalMs: stage.intervalMs,
          nextDueAt,
        });
        return {
          ...prev,
          [wordId]: {
            ...current,
            stageIndex: newStageIndex,
            knownCount: current.knownCount + 1,
            lastKnownAt: Date.now(),
            nextDueAt,
          },
        };
      });
      setLastMoved(wordId);
    },
    [setLastMoved]
  );

  const markUnknown = useCallback(
    (wordId: string) => {
      setProgress((prev) => {
        const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
        const regressedStageIndex = Math.max(current.stageIndex - 1, 0);
        const regressedStage = STAGES[regressedStageIndex];
        const nextRepeatMs = regressedStage.intervalMs > 0 ? regressedStage.intervalMs : undefined;
        const nextDueAt = nextRepeatMs != null ? Date.now() + nextRepeatMs : undefined;
        logNextDueAtCalculation({
          action: 'unknown',
          wordId,
          previousStageIndex: current.stageIndex,
          nextStageIndex: regressedStageIndex,
          intervalMs: nextRepeatMs,
          nextDueAt,
        });
        return {
          ...prev,
          [wordId]: {
            ...current,
            stageIndex: regressedStageIndex,
            unknownCount: current.unknownCount + 1,
            lastUnknownAt: Date.now(),
            nextDueAt,
          },
        };
      });
      setLastMoved(wordId);
    },
    [setLastMoved]
  );

  const getWordDisplayMode = useCallback(
    (wordId: string): 0 | 1 => {
      const progressEntry = progress[wordId];
      const total = (progressEntry?.unknownCount ?? 0) + (progressEntry?.knownCount ?? 0);
      return total % 2 === 0 ? 0 : 1;
    },
    [progress]
  );

  return {
    progress,
    lastMovedId,
    updateProgress,
    markKnown,
    markReallyKnown,
    markUnknown,
    getWordDisplayMode,
    applyServerProgress,
  };
}
