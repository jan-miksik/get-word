'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPendingSync,
  isAuthRequiredError,
  markServerSnapshotApplied,
} from '@/lib/sync';
import { installSyncLifecycle } from '@/lib/sync-coordinator';
import { flushOutboxBeforeRead, startDrainer } from '@/lib/local-first/drainer';
import {
  rebaseBlockedPreferenceOps,
  resumeAuthRequiredOps,
} from '@/lib/local-first/outbox';
import {
  applyPendingOutboxToSyncResponse,
} from '@/lib/local-first/hydrate';
import { consumeListsChangedForLearningSync } from '@/features/shared/sync/list-refresh-marker';
import type { SyncResponse } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';
import { wordListItemsToNormalizedWords } from '@/lib/words';
import { readStoredActiveListId } from './storage';
import {
  createLearningSyncEngine,
  subscribeLearningRefreshSignals,
  type LearningSyncEngine,
} from './syncEngineRuntime';

// Collapses the focus/visibilitychange/pageshow event burst (returning to the
// app fires all three) into one conditional refetch.
const REFETCH_THROTTLE_MS = 5 * 60_000;

// Cold boot with nothing cached: how long we wait for the server before giving
// up and letting the app render whatever local state it has.
const HYDRATION_TIMEOUT_MS = 15_000;

// Warm boot: the IndexedDB cache already produced a complete, usable state, so
// the server fetch only has this long to improve on it before we stop waiting.
export const WARM_START_SYNC_GRACE_MS = 4_000;

type BootTimers = {
  hydration?: ReturnType<typeof setTimeout>;
  warmFallback?: ReturnType<typeof setTimeout>;
};

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function clearBootTimers(timers: BootTimers): void {
  clearTimeout(timers.hydration);
  clearTimeout(timers.warmFallback);
}

interface UseServerSyncOptions {
  words: NormalizedWord[];
  isHydrated: boolean;
  setIsHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  isUpdatingFromServerRef: React.MutableRefObject<boolean>;
  applyServerProgress: (progress: SyncResponse['progress']) => void;
  mergeServerProgress: (progress: SyncResponse['progress']) => void;
  reconcileServerProgress: (data: SyncResponse) => SyncResponse;
  applyServerMemoryHooks: (memoryHooks: SyncResponse['memory_hooks']) => void;
  mergeServerMemoryHooks: (updated: SyncResponse['memory_hooks'], deleted: string[]) => void;
  applyServerCategories: (categories: SyncResponse['category_filters']) => void;
  applyServerProfile: (user: SyncResponse['user']) => void;
  applyServerPreferences: (user: SyncResponse['user']) => void;
  applyServerGameScore: (score: number) => void;
  applyServerSurveyCount: (count: number) => void;
  applyServerSurveyResponses: (responses: NonNullable<SyncResponse['survey_responses']>) => void;
  applyServerSurveyEligibility: (eligibility: NonNullable<SyncResponse['survey_eligibility']>) => void;
  setSyncedWords: React.Dispatch<React.SetStateAction<NormalizedWord[] | null>>;
  setSubscribedLists: React.Dispatch<React.SetStateAction<{
    id: string;
    name: string;
    languageFrom: string;
    languageTo: string;
    isRecommended?: boolean;
    isPersonal?: boolean;
    isOwnedPersonal?: boolean;
  }[]>>;
  setActiveListId: (id: string | null) => void;
}

export function useServerSync({
  words,
  isHydrated,
  setIsHydrated,
  isUpdatingFromServerRef,
  applyServerProgress,
  mergeServerProgress,
  reconcileServerProgress,
  applyServerMemoryHooks,
  mergeServerMemoryHooks,
  applyServerCategories,
  applyServerProfile,
  applyServerPreferences,
  applyServerGameScore,
  applyServerSurveyCount,
  applyServerSurveyResponses,
  applyServerSurveyEligibility,
  setSyncedWords,
  setSubscribedLists,
  setActiveListId,
}: UseServerSyncOptions) {
  const [isInitialServerSyncPending, setIsInitialServerSyncPending] = useState(true);
  const [isListRefreshPending, setIsListRefreshPending] = useState(false);
  const isHydratedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const bootTimersRef = useRef<BootTimers>({});
  const lastRefetchAtRef = useRef(0);
  const [syncEngine] = useState(createLearningSyncEngine);
  const applyCachedActiveListId = useCallback((cachedActiveListId: string | null | undefined) => {
    if (!cachedActiveListId) return;
    if (readStoredActiveListId()) return;
    setActiveListId(cachedActiveListId);
  }, [setActiveListId]);

  const applyServerData = useCallback(async (
    serverData: SyncResponse,
    options: { clearPending?: boolean; markServerSnapshot?: boolean } = {}
  ): Promise<void> => {
    if (options.clearPending ?? true) {
      clearPendingSync();
    }
    if (serverData.progress) applyServerProgress(serverData.progress);
    if (serverData.memory_hooks) applyServerMemoryHooks(serverData.memory_hooks);
    if (serverData.category_filters) applyServerCategories(serverData.category_filters);
    if (serverData.user) {
      applyServerProfile(serverData.user);
      applyServerPreferences(serverData.user);
    }
    if (serverData.user?.game_score !== undefined) {
      applyServerGameScore(serverData.user.game_score);
    }
    if (serverData.user?.survey_progress_count !== undefined) {
      applyServerSurveyCount(serverData.user.survey_progress_count);
    }
    if (serverData.survey_responses) applyServerSurveyResponses(serverData.survey_responses);
    if (serverData.survey_eligibility) applyServerSurveyEligibility(serverData.survey_eligibility);
    if (serverData.word_list_items && serverData.categories) {
      const converted = wordListItemsToNormalizedWords(
        serverData.word_list_items,
        serverData.categories,
        {
          mediaFallbackWords: words,
          listNamesById: Object.fromEntries(
            (serverData.lists ?? []).map((list) => [list.id, list.name]),
          ),
        }
      );
      setSyncedWords(converted);
    }
    if (serverData.lists) {
      setSubscribedLists(serverData.lists);
      if (serverData.lists.length > 0) {
        const currentId = readStoredActiveListId();
        const isValid = serverData.lists.some((list) => list.id === currentId);
        if (!currentId || !isValid) {
          setActiveListId(serverData.lists[0].id);
        }
      } else {
        setActiveListId(null);
      }
    }
    if (options.markServerSnapshot ?? true) {
      markServerSnapshotApplied();
    }
  }, [
    applyServerCategories,
    applyServerGameScore,
    applyServerSurveyCount,
    applyServerSurveyResponses,
    applyServerSurveyEligibility,
    applyServerMemoryHooks,
    applyServerPreferences,
    applyServerProfile,
    applyServerProgress,
    setActiveListId,
    setSubscribedLists,
    setSyncedWords,
    words,
  ]);

  const applyServerDelta = useCallback(async (delta: SyncResponse): Promise<void> => {
    if (delta.progress) mergeServerProgress(delta.progress);
    mergeServerMemoryHooks(delta.memory_hooks ?? {}, delta.memory_hooks_deleted ?? []);
    if (delta.category_filters) applyServerCategories(delta.category_filters);
    if (delta.user) {
      applyServerProfile(delta.user);
      applyServerPreferences(delta.user);
    }
    if (delta.user?.game_score !== undefined) {
      applyServerGameScore(delta.user.game_score);
    }
    if (delta.user?.survey_progress_count !== undefined) {
      applyServerSurveyCount(delta.user.survey_progress_count);
    }
    // Always sent in full by the server (not a partial delta), so applying it
    // here is the same replace as the full-snapshot path.
    if (delta.survey_responses) applyServerSurveyResponses(delta.survey_responses);
    if (delta.survey_eligibility) applyServerSurveyEligibility(delta.survey_eligibility);
  }, [
    applyServerCategories,
    applyServerGameScore,
    applyServerSurveyCount,
    applyServerSurveyResponses,
    applyServerSurveyEligibility,
    applyServerPreferences,
    applyServerProfile,
    mergeServerMemoryHooks,
    mergeServerProgress,
  ]);

  const applyFreshServerData = useCallback(async (serverData: SyncResponse) => {
    isUpdatingFromServerRef.current = true;
    const overlaidServerData = await applyPendingOutboxToSyncResponse(
      serverData,
      serverData.submitted_review_events ?? []
    ).catch(() => serverData);
    // The outbox overlay only covers mutations still waiting to be sent. Rows
    // whose ops were already acknowledged are protected by the reconciliation
    // instead, which compares the payload against what this device holds.
    const freshServerData = reconcileServerProgress(overlaidServerData);
    if (serverData.is_delta) {
      await applyServerDelta(freshServerData);
      // A delta still carries the whole user block, so it is as much of a
      // server snapshot as a full payload where preferences are concerned.
      // Leaving it unmarked was how a warm start — cache first, then a delta
      // or an "unchanged" answer, and never a full snapshot — kept preference
      // writes gated off for the entire session: the panel showed the new
      // choice, nothing was enqueued, and the next delta's user block put the
      // stored value back.
      markServerSnapshotApplied();
    } else {
      await applyServerData(freshServerData, { clearPending: false });
    }
    requestAnimationFrame(() => {
      isUpdatingFromServerRef.current = false;
    });
  }, [applyServerData, applyServerDelta, isUpdatingFromServerRef, reconcileServerProgress]);

  const refetchServerData = useCallback(() => {
    if (!isHydratedRef.current) return;
    const listRefreshMarker = consumeListsChangedForLearningSync();
    const forceFullRefresh = Boolean(listRefreshMarker);
    if (listRefreshMarker?.listId) {
      setActiveListId(listRefreshMarker.listId);
    }
    // Returning to the app fires focus + visibilitychange + pageshow at once;
    // collapse the burst into a single conditional fetch.
    const now = Date.now();
    if (!forceFullRefresh && now - lastRefetchAtRef.current < REFETCH_THROTTLE_MS) return;
    lastRefetchAtRef.current = now;
    if (forceFullRefresh) {
      setIsListRefreshPending(true);
    }
    void (async () => {
      // Send before reading: the drainer answers the same focus/visibility
      // events this refetch does, and a read that overtakes the write comes
      // back describing state from before the user's last review.
      await flushOutboxBeforeRead();
      await syncEngine.pull({ forceFull: forceFullRefresh });
    })()
      .catch((error) => {
        if (!isAuthRequiredError(error)) {
          console.error('[useServerSync] Failed to refresh:', error);
        }
      })
      .finally(() => {
        if (forceFullRefresh) {
          setIsListRefreshPending(false);
        }
      });
  }, [setActiveListId, syncEngine]);

  /** Awaited, unconditional snapshot used after a successful word-chat commit. */
  const refreshFullSnapshot = useCallback(async () => {
    await flushOutboxBeforeRead();
    await syncEngine.pull({ forceFull: true });
  }, [syncEngine]);

  const handleEngineData = useCallback(async (
    event: Parameters<Parameters<LearningSyncEngine['onData']>[0]>[0],
  ): Promise<void> => {
    const timers = bootTimersRef.current;
    if (event.source === 'cache') {
      if (isHydratedRef.current) return;
      isUpdatingFromServerRef.current = true;
      await applyServerData(event.value.syncResponse, {
        clearPending: false,
        markServerSnapshot: false,
      });
      applyCachedActiveListId(event.value.activeListId);
      isHydratedRef.current = true;
      setIsHydrated(true);
      // Cache is usable immediately, while the card order remains frozen for a
      // short grace period so a quick server response cannot reshuffle it.
      timers.warmFallback = setTimeout(() => {
        setIsInitialServerSyncPending(false);
      }, WARM_START_SYNC_GRACE_MS);
      requestAnimationFrame(() => {
        isUpdatingFromServerRef.current = false;
      });
      return;
    }

    clearBootTimers(timers);
    await applyFreshServerData(event.value);
    isHydratedRef.current = true;
    setIsHydrated(true);
    setIsInitialServerSyncPending(false);
  }, [
    applyCachedActiveListId,
    applyFreshServerData,
    applyServerData,
    isUpdatingFromServerRef,
    setIsHydrated,
  ]);

  useEffect(
    () => syncEngine.onData(handleEngineData),
    [handleEngineData, syncEngine],
  );

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    const timers = bootTimersRef.current;

    timers.hydration = setTimeout(() => {
      if (!isHydratedRef.current) {
        isHydratedRef.current = true;
        setIsHydrated(true);
        setIsInitialServerSyncPending(false);
        isUpdatingFromServerRef.current = false;
      }
    }, HYDRATION_TIMEOUT_MS);

    syncEngine.start();
    const listRefreshMarker = consumeListsChangedForLearningSync();
    if (listRefreshMarker?.listId) setActiveListId(listRefreshMarker.listId);
    void syncEngine.boot({ forceFull: Boolean(listRefreshMarker) }).catch((error) => {
      clearBootTimers(timers);
      if (!isAuthRequiredError(error)) {
        console.error('[useServerSync] Failed to fetch:', error);
      }
      isHydratedRef.current = true;
      setIsHydrated(true);
      setIsInitialServerSyncPending(false);
      isUpdatingFromServerRef.current = false;
    });

    return () => {
      syncEngine.stop();
    };
  }, [isUpdatingFromServerRef, setActiveListId, setIsHydrated, syncEngine]);

  useEffect(() => {
    if (!isHydrated) return;
    const lifecycle = startDrainer();
    // A successful app boot proves the session is usable again. Resume only
    // auth-paused operations; conflicts and permanent failures remain visible
    // until their explicit recovery path is chosen.
    void resumeAuthRequiredOps().then(() => flushOutboxBeforeRead());
    const cleanup = installSyncLifecycle();
    return () => {
      cleanup();
      lifecycle.stop();
    };
  }, [isHydrated]);

  useEffect(() => {
    const onServerSync = (event: Event) => {
      const detail = (event as CustomEvent<SyncResponse>).detail;
      if (detail?.success) {
        void syncEngine.ingest(detail).catch((error) => {
          console.error('[useServerSync] Failed to persist pushed snapshot:', error);
        });
      }
    };
    const unsubscribeRefresh = subscribeLearningRefreshSignals(refetchServerData);
    const onRebaseConflicts = () => {
      void syncEngine.pull({ forceFull: true }).then(async (snapshot) => {
        if (!snapshot) return;
        await rebaseBlockedPreferenceOps({
          settingsLanguageRevision: snapshot.user.settings_language_revision ?? 0,
          languagePairRevision: snapshot.user.language_pair_revision ?? 0,
          settingsLanguageChosenAt: toEpochMs(snapshot.user.settings_language_selected_at),
          languagePairChosenAt: toEpochMs(snapshot.user.onboarding_completed_at),
        });
        await flushOutboxBeforeRead();
        await syncEngine.pull({ forceFull: true });
      }).catch((error) => {
        console.error('[useServerSync] Failed to rebase conflicts:', error);
      });
    };
    window.addEventListener('get-word:server-sync', onServerSync);
    window.addEventListener('get-word:rebase-sync-conflicts', onRebaseConflicts);
    return () => {
      window.removeEventListener('get-word:server-sync', onServerSync);
      window.removeEventListener('get-word:rebase-sync-conflicts', onRebaseConflicts);
      unsubscribeRefresh();
    };
  }, [refetchServerData, syncEngine]);

  return {
    isInitialServerSyncPending,
    isListRefreshPending,
    refreshFullSnapshot,
  };
}
