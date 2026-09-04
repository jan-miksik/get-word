'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressData, SyncResponse, SyncReviewEventItem } from '@/features/sync/contracts';
import { enqueueOp } from '@/lib/local-first/enqueue';
import { progressActivityAt } from '@/lib/progress-freshness';
import { STAGES } from '@/lib/words';
import { requestSync } from '@/lib/sync-coordinator';
import {
  createReviewEvent,
  enqueueReviewEvent,
  getPendingReviewEvents,
  getReviewEventTargetId,
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
  event: SyncReviewEventItem,
): ProgressData {
  const base: ProgressData = current ?? { stageIndex: 0, knownCount: 0, unknownCount: 0 };
  const now = event.client_created_at;
  const nextStageIndex =
    event.action === 'known'
      ? Math.min(base.stageIndex + 1, STAGES.length - 1)
      : event.action === 'really_known'
        ? Math.min(base.stageIndex + 2, STAGES.length - 1)
        : event.action === 'stay'
          ? base.stageIndex
          : Math.max(base.stageIndex - 1, 0);
  const stage = STAGES[nextStageIndex];
  // A word retired as "fully known" sits at the top stage with no due date.
  // Answering it right again (it can still turn up as practise-ahead material)
  // must not quietly put it back on the 60-day treadmill; only getting it wrong
  // returns it to the rotation.
  const staysRetired =
    event.action !== 'unknown' &&
    base.stageIndex === STAGES.length - 1 &&
    !base.nextDueAt;
  const nextDueAt = staysRetired
    ? undefined
    : stage.intervalMs > 0
      ? now + stage.intervalMs
      : undefined;

  return {
    ...base,
    stageIndex: nextStageIndex,
    knownCount: event.action === 'unknown' ? base.knownCount : base.knownCount + 1,
    unknownCount: event.action === 'unknown' ? base.unknownCount + 1 : base.unknownCount,
    lastKnownAt: event.action === 'unknown' ? base.lastKnownAt : now,
    lastUnknownAt: event.action === 'unknown' ? now : base.lastUnknownAt,
    nextDueAt,
    introducedAt: base.introducedAt ?? now,
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

function toIsoOrNull(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

/** Render a locally held progress row in the wire shape a server payload uses. */
function toServerShape(
  key: string,
  local: ProgressData,
  existing: SyncResponse['progress'][string] | undefined,
  userId: string
): SyncResponse['progress'][string] {
  const isUuid = UUID_RE.test(key);
  const updatedAt = new Date(progressActivityAt(local)).toISOString();
  return {
    id: existing?.id ?? key,
    userId: existing?.userId ?? userId,
    wordId: existing?.wordId ?? (isUuid ? null : key),
    wordListItemId: existing?.wordListItemId ?? (isUuid ? key : null),
    stageIndex: local.stageIndex,
    knownCount: local.knownCount,
    unknownCount: local.unknownCount,
    lastKnownAt: toIsoOrNull(local.lastKnownAt),
    lastUnknownAt: toIsoOrNull(local.lastUnknownAt),
    nextDueAt: toIsoOrNull(local.nextDueAt),
    introducedAt: local.introducedAt ? new Date(local.introducedAt).toISOString() : null,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  };
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
      if (!serverProgress) return;
      const next: Record<string, ProgressData> = {};
      for (const [wordId, progressEntry] of Object.entries(serverProgress)) {
        next[wordId] = {
          stageIndex: progressEntry.stageIndex,
          knownCount: progressEntry.knownCount,
          unknownCount: progressEntry.unknownCount,
          lastKnownAt: progressEntry.lastKnownAt ? new Date(progressEntry.lastKnownAt).getTime() : undefined,
          lastUnknownAt: progressEntry.lastUnknownAt ? new Date(progressEntry.lastUnknownAt).getTime() : undefined,
          nextDueAt: progressEntry.nextDueAt ? new Date(progressEntry.nextDueAt).getTime() : undefined,
          introducedAt: progressEntry.introducedAt ? new Date(progressEntry.introducedAt).getTime() : undefined,
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
            introducedAt: progressEntry.introducedAt ? new Date(progressEntry.introducedAt).getTime() : undefined,
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

  /**
   * Repair a server payload that is older than this device before anything
   * consumes it.
   *
   * A GET issued while a POST is still in flight is answered from database
   * state that predates the mutation. By the time that answer arrives the
   * drainer has been acknowledged and has dropped the outbox entries that
   * would otherwise have masked it, so nothing else stands between the stale
   * rows and the user: the word just marked known drops back a stage with a
   * `nextDueAt` already in the past, and the study stream serves it again.
   * Both /api/sync GETs and the drainer POST fire on focus, visibilitychange
   * and online, so the two run concurrently by design.
   *
   * The caller applies this before writing state *and* before persisting to
   * IndexedDB, so a stale row can't be resurrected by the next warm boot
   * either.
   */
  const reconcileServerProgress = useCallback((data: SyncResponse): SyncResponse => {
    const serverProgress = data.progress;
    if (!serverProgress) return data;
    const local = progressRef.current;
    // A delta only describes rows that changed, so a missing key says nothing
    // there. Only a full snapshot claims to be the complete set, and only then
    // does an absent row mean "the server has no progress for this word".
    const keys = data.is_delta ? Object.keys(serverProgress) : Object.keys(local);

    let reconciled: SyncResponse['progress'] | null = null;
    for (const key of keys) {
      const localEntry = local[key];
      if (!localEntry) continue;
      const localAt = progressActivityAt(localEntry);
      if (localAt === 0) continue;
      if (localAt <= progressActivityAt(serverProgress[key])) continue;
      reconciled = reconciled ?? { ...serverProgress };
      reconciled[key] = toServerShape(key, localEntry, serverProgress[key], data.user.id);
    }

    return reconciled ? { ...data, progress: reconciled } : data;
  }, []);

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
    (event: SyncReviewEventItem) => {
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
    (wordId: string, action: SyncReviewEventItem['action']) => {
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

  const markStay = useCallback(
    (wordId: string) => recordReviewEvent(wordId, 'stay'),
    [recordReviewEvent]
  );

  const setCustomStage = useCallback(
    (
      wordId: string,
      stageIndex: number,
      opts?: { noRepeat?: boolean; countAsKnown?: boolean; countAsUnknown?: boolean },
    ) => {
      const now = Date.now();
      const noRepeat = opts?.noRepeat === true;
      const preserveSchedule = opts?.countAsKnown === true || opts?.countAsUnknown === true;
      const prev = progressRef.current;
      const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      const previousStageIndex = current.stageIndex;
      const requestedStageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1));
      const clampedStageIndex = preserveSchedule ? previousStageIndex : requestedStageIndex;
      const stage = STAGES[clampedStageIndex];
      const nextDueAt = preserveSchedule
        ? current.nextDueAt
        : noRepeat
        ? undefined
        : stage.intervalMs > 0
          ? now + stage.intervalMs
          : undefined;

      let knownCount = current.knownCount;
      let unknownCount = current.unknownCount;
      let lastKnownAt = current.lastKnownAt;
      let lastUnknownAt = current.lastUnknownAt;

      if (opts?.countAsKnown) {
        // Reinforcement is a real completed answer, but deliberately not an
        // SRS review. Counting it gives the second-pass block a durable,
        // reload-safe completion signal while both the stage and its existing
        // due date stay exactly where the introduction put them.
        knownCount += 1;
        lastKnownAt = now;
      } else if (opts?.countAsUnknown) {
        // A failed immediate check is useful session feedback, but it must not
        // demote a word that entered the SRS only moments ago or pull its due
        // date forward. The scheduled five-minute review remains the first
        // review that is allowed to move the ladder.
        unknownCount += 1;
        lastUnknownAt = now;
      } else if (noRepeat) {
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
        introducedAt: current.introducedAt ?? now,
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
    markStay,
    markUnknown,
    setCustomStage,
    getWordDisplayMode,
    applyServerProgress,
    mergeServerProgress,
    reconcileServerProgress,
  };
}
