'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressData, SyncResponse } from '@/lib/sync';
import { enqueueOp } from '@/lib/local-first/enqueue';
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

/**
 * Fold a single review event into a progress row. Mirrors the server's
 * `applyReviewEventToProgress` so optimistic client state matches what the
 * server will compute when it eventually applies the event.
 */
function applyEventToEntry(
  current: ProgressData | undefined,
  event: ReviewEventPayload,
): ProgressData {
  const base: ProgressData = current ?? { stageIndex: 0, knownCount: 0, unknownCount: 0 };
  const now = event.client_created_at;
  const nextStageIndex =
    event.action === 'known'
      ? Math.min(base.stageIndex + 1, STAGES.length - 1)
      : event.action === 'really_known'
        ? Math.min(base.stageIndex + 2, STAGES.length - 1)
        : Math.max(base.stageIndex - 1, 0);
  const stage = STAGES[nextStageIndex];
  const nextDueAt = stage.intervalMs > 0 ? now + stage.intervalMs : undefined;

  return {
    ...base,
    stageIndex: nextStageIndex,
    knownCount: event.action === 'unknown' ? base.knownCount : base.knownCount + 1,
    unknownCount: event.action === 'unknown' ? base.unknownCount + 1 : base.unknownCount,
    lastKnownAt: event.action === 'unknown' ? base.lastKnownAt : now,
    lastUnknownAt: event.action === 'unknown' ? now : base.lastUnknownAt,
    nextDueAt,
  };
}

/**
 * Replay any review events that are still in the local outbox on top of a
 * server snapshot. This is the client-side counterpart to the server's
 * event-sourced apply — the server's snapshot lags behind events that are
 * either still debouncing in the outbox or were POSTed but whose response
 * arrived out of order. Without this, a snapshot would visibly revert words
 * the user just touched.
 *
 * Reads from the localStorage outbox, which `enqueueReviewEvent` always
 * populates first, so this works whether or not IndexedDB is available.
 */
function withPendingEventsApplied(
  map: Record<string, ProgressData>,
): Record<string, ProgressData> {
  const pending = getPendingReviewEvents();
  if (pending.length === 0) return map;
  // Outbox is already ordered by enqueue time; events for the same word must
  // apply in that order to match server-side composition.
  const next = { ...map };
  for (const event of pending) {
    const targetId = getReviewEventTargetId(event);
    if (!targetId) continue;
    const current = next[targetId];
    const latestLocalActivity = Math.max(
      current?.lastKnownAt ?? 0,
      current?.lastUnknownAt ?? 0,
    );
    // Server snapshots are overlaid with pending custom progress before they
    // reach this hook. If that custom write happened after an older review
    // event, replaying the review event here would undo the user's selected
    // repeat interval (for example, 5 min visibly becoming 1 day).
    if (latestLocalActivity >= event.client_created_at) continue;
    next[targetId] = applyEventToEntry(next[targetId], event);
  }
  return next;
}

export function serializeProgressForSync(
  progress: Record<string, ProgressData>,
  clientUpdatedAt: number = Date.now(),
) {
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
      // Stamp the moment of this write so server can LWW-arbitrate against
      // any newer state already on the row. Without this, a stale outbox
      // replay can silently clobber a fresher write from another tab/device.
      client_updated_at: clientUpdatedAt,
    };
  });
}

export function useProgress(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [progress, setProgress] = useState<Record<string, ProgressData>>({});
  const progressRef = useRef<Record<string, ProgressData>>({});
  const displayModeRef = useRef<Map<string, { reviewCount: number; mode: 0 | 1 }>>(new Map());
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const lastMovedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

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
      // Replay outbox-pending events on top so the user doesn't see their
      // just-marked words revert while the POST is still in flight or before
      // its response has been processed.
      const merged = withPendingEventsApplied(next);
      progressRef.current = merged;
      setProgress(merged);
    },
    []
  );

  // Delta variant: merge a partial server snapshot into existing state without
  // dropping rows that weren't returned. Used for ?since= delta fetches.
  const mergeServerProgress = useCallback(
    (serverProgress: SyncResponse['progress']) => {
      if (!serverProgress || Object.keys(serverProgress).length === 0) return;
      setProgress((prev) => {
        const next: Record<string, ProgressData> = { ...prev };
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
        // Same outbox replay as the full-snapshot path: a delta can carry rows
        // that another device (or our own in-flight POST) wrote, but the
        // events still queued locally always represent the truest user intent.
        const merged = withPendingEventsApplied(next);
        progressRef.current = merged;
        return merged;
      });
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
      const next = { ...prev, [wordId]: { ...current, ...updates } };
      progressRef.current = next;
      return next;
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

      setProgress((prev) => {
        const next = {
          ...prev,
          [wordId]: applyEventToEntry(prev[wordId], event),
        };
        progressRef.current = next;
        return next;
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
      const prev = progressRef.current;
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

      const nextEntry: ProgressData = {
        ...current,
        stageIndex: clampedStageIndex,
        knownCount,
        unknownCount,
        lastKnownAt,
        lastUnknownAt,
        nextDueAt,
      };
      progressRef.current = { ...prev, [wordId]: nextEntry };
      setProgress(progressRef.current);

      setLastMoved(wordId);

      const [serialized] = serializeProgressForSync({ [wordId]: nextEntry }, now);
      void enqueueOp({
        entity: 'progress',
        opType: 'upsert',
        payload: serialized,
        legacyPayload: { progress: [serialized] },
      }).catch((e) => console.error('[progress] enqueue custom stage:', e));
    },
    [setLastMoved]
  );

  const getWordDisplayMode = useCallback(
    (wordId: string): 0 | 1 => {
      const progressEntry = progress[wordId];
      const reviewCount = (progressEntry?.unknownCount ?? 0) + (progressEntry?.knownCount ?? 0);
      const current = displayModeRef.current.get(wordId);

      // Pick a side once for this appearance of the word. Keeping the choice
      // in a ref prevents ordinary React rerenders from moving the cover, while
      // a later review gets a fresh, unpredictable prompt direction.
      if (!current || current.reviewCount !== reviewCount) {
        const mode: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        displayModeRef.current.set(wordId, { reviewCount, mode });
        return mode;
      }

      return current.mode;
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
    mergeServerProgress,
  };
}
