'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressData, SyncResponse } from '@/lib/sync';
import { debouncedSync } from '@/lib/sync';
import { STAGES } from '@/lib/words';
import { requestSync } from '@/lib/sync-coordinator';
import {
  createReviewEvent,
  enqueueReviewEvent,
  getPendingReviewEvents,
  getReviewEventTargetId,
  type ReviewEventPayload,
} from '@/lib/review-events';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';

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
  action: 'known' | 'really-known' | 'unknown' | 'custom';
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

  const syncReviewOutbox = useCallback(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    const pending = getPendingReviewEvents();
    if (pending.length === 0) return;
    requestSync('review_event');
  }, [isHydrated, isUpdatingFromServerRef]);

  const applyLocalReviewEvent = useCallback(
    (event: ReviewEventPayload) => {
      const wordId = getReviewEventTargetId(event);
      if (!wordId) return;
      const now = event.client_created_at;

      setProgress((prev) => {
        const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
        const nextStageIndex =
          event.action === 'known'
            ? Math.min(current.stageIndex + 1, STAGES.length - 1)
            : event.action === 'really_known'
              ? Math.min(current.stageIndex + 2, STAGES.length - 1)
              : Math.max(current.stageIndex - 1, 0);
        const stage = STAGES[nextStageIndex];
        const nextDueAt = stage.intervalMs > 0 ? now + stage.intervalMs : undefined;
        logNextDueAtCalculation({
          action: event.action === 'really_known' ? 'really-known' : event.action,
          wordId,
          previousStageIndex: current.stageIndex,
          nextStageIndex,
          intervalMs: stage.intervalMs,
          nextDueAt,
        });

        return {
          ...prev,
          [wordId]: {
            ...current,
            stageIndex: nextStageIndex,
            knownCount:
              event.action === 'unknown' ? current.knownCount : current.knownCount + 1,
            unknownCount:
              event.action === 'unknown' ? current.unknownCount + 1 : current.unknownCount,
            lastKnownAt: event.action === 'unknown' ? current.lastKnownAt : now,
            lastUnknownAt: event.action === 'unknown' ? now : current.lastUnknownAt,
            nextDueAt,
          },
        };
      });
      setLastMoved(wordId);
    },
    [setLastMoved]
  );

  const recordReviewEvent = useCallback(
    (wordId: string, action: ReviewEventPayload['action']) => {
      const event = createReviewEvent(wordId, action);
      applyLocalReviewEvent(event);
      enqueueReviewEvent(event);
      postTabMessage({ type: 'review_event', event });
      syncReviewOutbox();
    },
    [applyLocalReviewEvent, syncReviewOutbox]
  );

  useEffect(() => {
    syncReviewOutbox();
  }, [syncReviewOutbox]);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'review_event') return;
      applyLocalReviewEvent(message.event);
      enqueueReviewEvent(message.event);
      syncReviewOutbox();
    });
  }, [applyLocalReviewEvent, syncReviewOutbox]);

  const markKnown = useCallback(
    (wordId: string) => recordReviewEvent(wordId, 'known'),
    [recordReviewEvent]
  );

  const markReallyKnown = useCallback(
    (wordId: string) => recordReviewEvent(wordId, 'really_known'),
    [recordReviewEvent]
  );

  const markUnknown = useCallback(
    (wordId: string) => recordReviewEvent(wordId, 'unknown'),
    [recordReviewEvent]
  );

  const setCustomStage = useCallback(
    (wordId: string, stageIndex: number, opts?: { noRepeat?: boolean }) => {
      const now = Date.now();
      const noRepeat = opts?.noRepeat === true;
      const clampedStageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1));
      let nextEntry: ProgressData | null = null;

      setProgress((prev) => {
        const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
        const previousStageIndex = current.stageIndex;
        const stage = STAGES[clampedStageIndex];
        const nextDueAt = noRepeat
          ? undefined
          : stage.intervalMs > 0
            ? now + stage.intervalMs
            : undefined;

        let knownCount = current.knownCount;
        let unknownCount = current.unknownCount;
        let lastKnownAt = current.lastKnownAt;
        let lastUnknownAt = current.lastUnknownAt;

        if (noRepeat) {
          if (previousStageIndex < clampedStageIndex) {
            knownCount += 1;
          }
          lastKnownAt = now;
        } else if (clampedStageIndex > previousStageIndex) {
          knownCount += 1;
          lastKnownAt = now;
        } else if (clampedStageIndex < previousStageIndex) {
          unknownCount += 1;
          lastUnknownAt = now;
        } else {
          lastKnownAt = now;
        }

        logNextDueAtCalculation({
          action: 'custom',
          wordId,
          previousStageIndex,
          nextStageIndex: clampedStageIndex,
          intervalMs: noRepeat ? undefined : stage.intervalMs,
          nextDueAt,
        });

        const updated: ProgressData = {
          ...current,
          stageIndex: clampedStageIndex,
          knownCount,
          unknownCount,
          lastKnownAt,
          lastUnknownAt,
          nextDueAt,
        };
        nextEntry = updated;

        return {
          ...prev,
          [wordId]: updated,
        };
      });

      setLastMoved(wordId);

      if (nextEntry) {
        debouncedSync({ progress: serializeProgressForSync({ [wordId]: nextEntry }) }).catch(
          (e) => console.error('[progress] sync custom stage:', e)
        );
      }
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
    setCustomStage,
    getWordDisplayMode,
    applyServerProgress,
  };
}
