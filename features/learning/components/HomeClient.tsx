'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { LearningStudyContent } from '@/features/learning/components/LearningStudyContent';
import { useViewModePreference } from '@/features/learning/app-state/useViewModePreference';
import { useMinigameFrequencyPreference } from '@/features/learning/hooks/useMinigameFrequencyPreference';
import { useLearningPageState } from '@/features/learning/hooks/useLearningPageState';
import { usePressHandlers } from '@/features/learning/hooks/usePressHandlers';
import { useLearningRenderers } from '@/features/learning/hooks/useLearningRenderers';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import { useSessionBreather } from '@/features/learning/session/useSessionBreather';
import { SessionBreatherCard } from '@/features/learning/components/SessionBreatherCard';
import { useAppState } from '@/hooks/useAppState';
import {
  getAvailableCategories,
  shouldShowMemoryHookForStage,
  STAGES,
  type NormalizedWord,
} from '@/lib/words';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BootErrorScreen } from '@/components/BootErrorScreen';
import { LandingPage } from '@/features/landing/public.client';
import { AudioStorageDebugBadge } from '@/components/AudioStorageDebugBadge';
import { setAudioStorageLoggingEnabled } from '@/lib/audio-debug';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/features/auth/public.client';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';
import { LearningLanguageOnboarding } from '@/features/learning/onboarding/LearningLanguageOnboarding';
import {
  readLandingLanguagePair,
  markLandingLanguagePairConsumed,
} from '@/features/shared/languages/landingPairStorage';
import { MemoryHooksIntroCard } from '@/features/learning/components/MemoryHooksIntroCard';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import { AddPersonalWordsPrompt } from '@/features/learning/components/AddPersonalWordsPrompt';
import { usePWAInstallIntro } from '@/features/learning/hooks/usePWAInstallIntro';
import { FeatureTour } from '@/features/learning/onboarding/FeatureTour';
import { useFeatureTour } from '@/features/learning/onboarding/useFeatureTour';
import { shouldOfferMorePersonalWords } from '@/features/learning/personalWordsPrompt';
import { useAppSurface } from '@/features/workspace/public.client';
import { migrateDraftToLanguagePair } from '@/features/word-chat/client/storage';
import { normalizeLanguageCode } from '@/lib/i18n/languages';
import { useBackgroundTargetAudioRepair } from '@/features/learning/hooks/useBackgroundTargetAudioRepair';
import { chooseBaseStudyListForPair } from '@/features/learning/state/study-list-selection';
import { flushOutboxBeforeRead } from '@/lib/local-first/drainer';
import { useGoalSummary } from '@/features/learning/goals/useGoalSummary';
import { useStudyCountdown } from '@/features/learning/goals/useStudyCountdown';
import { useGoalReminders } from '@/features/learning/goals/useGoalReminders';
import { type StudyGoalVersion, type StudyPacing } from '@/packages/domain/goals/goal';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import { useSaveStudyGoal } from '@/features/learning/goals/useSaveStudyGoal';
import { StudyReminderOnboarding } from '@/features/learning/onboarding/StudyReminderOnboarding';
import { resolveLearningOnboardingStep } from '@/features/learning/onboarding/flow';
import { LanguageLevelOnboarding } from '@/features/learning/onboarding/LanguageLevelOnboarding';
import { useLanguageLevelStep } from '@/features/learning/onboarding/useLanguageLevelStep';
import { unsubscribeFromStudyWebPush } from '@/features/learning/goals/web-push';
import { syncUserData } from '@/lib/sync';

const BOOT_LOADING_TIMEOUT_MS = 12_000;

// A surface now swaps in place instead of replacing the screen, so an empty
// panel while its chunk downloads just reads as broken. Say something instead.
function SurfaceLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center p-8">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40 motion-reduce:animate-none"
      />
    </div>
  );
}

const AddWordsScreen = dynamic(
  () => import('@/features/word-chat/components/AddWordsScreen').then((m) => m.AddWordsScreen),
  { ssr: false, loading: SurfaceLoading },
);

// Photo lab is a whole second UI (camera flow, IndexedDB store, zoom canvas).
// Opening it in place must not put any of that in the study page's bundle, so
// it is fetched the first time a learner actually opens it.
const PhotoLabPage = dynamic(
  () => import('@/features/photo-lab/components/PhotoLabPage').then((m) => m.PhotoLabPage),
  { ssr: false, loading: SurfaceLoading },
);

// The learning app now runs entirely on synced word_list_items; there is no
// legacy seed word set. Stable identity avoids needless memo recomputes.
const EMPTY_WORDS: NormalizedWord[] = [];

type HomeClientProps = {
  /**
   * `next/font` class for the photo-lab display font, loaded in the server
   * route and handed down because font loaders cannot run in a client
   * component. Only matters while the lab is open.
   */
  photoDisplayFontClass?: string;
};

/**
 * The signed-in learning app shell. Rendered by `app/page.tsx` only for
 * visitors with a valid app session; signed-out visitors get the
 * server-rendered `LandingPage` instead. The `isSignedOut` branch below is a
 * defensive fallback for the brief client window after a sign-out.
 */
export function HomeClient({ photoDisplayFontClass }: HomeClientProps = {}) {
  const [loaderDismissed, setLoaderDismissed] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  // Lets an already-onboarded user replay the language-onboarding screen via
  // `?onboarding=1`. Safe to read in a lazy initializer: the first render is
  // always the LoadingScreen on both server and client, so this value never
  // participates in the hydrated tree.
  const [forceOnboarding, setForceOnboarding] = useState(
    () => {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search);
      return params.get('onboarding') === '1';
    }
  );
  const [forceWordChat, setForceWordChat] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('wordChat') === '1',
  );
  const [completedDeckWordCards, setCompletedDeckWordCards] = useState(0);
  // The deck writes the SRS answer only once its exit animation ends, which
  // left the rails frozen for the length of that animation after every answer.
  // An answered card joins this set on the tap and is counted for display until
  // the real progress entry lands (see `computeBlockProgress`).
  const [pendingAnsweredIds, setPendingAnsweredIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Set from the closing card: the day is already earned, and the learner chose
  // to keep going through the repeats it deliberately left out.
  const [continueAnyway, setContinueAnyway] = useState(false);
  const [memoryHooksIntroDismissedForSession, setMemoryHooksIntroDismissedForSession] = useState(false);
  const [addWordsPromptDismissedForSession, setAddWordsPromptDismissedForSession] =
    useState(false);
  // Completing onboarding updates the language preference synchronously, but
  // the new list reaches the study stream through a fresh snapshot. Keep the
  // global loader up across that handoff so the empty deck cannot flash
  // "All done" between those two state updates.
  const [isOnboardingHandoffPending, setIsOnboardingHandoffPending] = useState(false);
  const [landingLanguagePair] = useState(() =>
    typeof window !== 'undefined' ? readLandingLanguagePair() : null,
  );
  const {
    isConnected,
    isAuthLoading,
    email,
    school,
    hasAuthError,
    retryAuth,
    signOut,
  } = useAuth();

  const appState = useAppState(EMPTY_WORDS);
  const {
    role,
    showAll,
    progress,
    selectedCategories,
    showEnglish,
    showCategoryBadges,
    showPronunciation,
    revealMode,
    memoryHooksEnabled,
    memoryHooksIntroAnswered,
    memoryHookDisableFromStage,
    studyNotesEnabled,
    studyNoteMinimizeFromStage,
    swipeCardsEnabled,
    tiltGameEnabled,
    learningFineTune,
    typingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    markKnown,
    markReallyKnown,
    markUnknown,
    setCustomStage,
    filteredWords,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    categoryOrder,
    pinnedCategoryIds,
    ownedPersonalListIds,
    isHydrated,
    isInitialServerSyncPending,
    isListRefreshPending,
    setGameScore,
    syncedWords,
    allSyncedWords,
    isStudyEmptyForPair,
    userId,
    userEmail,
    userWalletAddress,
    learningLanguageFrom,
    learningLanguageTo,
    onboardingCompletedAt,
    setLearningLanguages,
    setActiveListId,
    setMemoryHooksEnabled,
    setMemoryHooksIntroAnswered,
    subscribedLists,
    isEditor,
    refreshFullSnapshot,
    photoLabEnabled,
  } = appState;
  const {
    activeSurface,
    navigateSurface,
    replaceSurface,
    returnToStudy,
    visitedSurfaces,
  } = useAppSurface(photoLabEnabled);
  const activeListMatchesLearningPair = Boolean(
    appState.activeList &&
      learningLanguageFrom &&
      learningLanguageTo &&
      normalizeLanguageCode(appState.activeList.languageFrom) ===
        normalizeLanguageCode(learningLanguageFrom) &&
      normalizeLanguageCode(appState.activeList.languageTo) ===
        normalizeLanguageCode(learningLanguageTo),
  );
  const changeLearningLanguagePair = useCallback(
    async ({ from, to }: { from: string; to: string }) => {
      if (learningLanguageFrom && learningLanguageTo) {
        migrateDraftToLanguagePair(
          learningLanguageFrom,
          learningLanguageTo,
          from,
          to,
        );
      }
      await setLearningLanguages(from, to);
      setActiveListId(
        chooseBaseStudyListForPair(subscribedLists, appState.activeListId, from, to),
      );
    },
    [
      learningLanguageFrom,
      learningLanguageTo,
      setActiveListId,
      setLearningLanguages,
      subscribedLists,
      appState.activeListId,
    ],
  );

  // The app runs on synced words (from word_list_items).
  const activeWords = syncedWords ?? EMPTY_WORDS;

  // Swipe-to-answer (frontier feature): right = known, left = forgotten,
  // up = fully known / no repeat. Typing cards opt out per card (see
  // isTypingCard) so vertical movement with the mobile keyboard cannot discard
  // a word. The
  // deck's own group index is a stream-section index (due/new), not the SRS stage.
  const deckSwipeActions = useMemo(
    () =>
      swipeCardsEnabled
        ? {
            markKnown,
            markUnknown,
            markFullyKnown: (wordId: string) =>
              setCustomStage(wordId, STAGES.length - 1, { noRepeat: true }),
            getStageIndex: (wordId: string) => progress[wordId]?.stageIndex ?? 0,
          }
        : undefined,
    [swipeCardsEnabled, markKnown, markUnknown, setCustomStage, progress]
  );

  // A cached profile means this device completed a sync while signed in, and
  // sign-out wipes that cache. So when the identity check merely *failed* (as
  // opposed to answering "signed out"), trust the cache and run offline rather
  // than locking out a user whose session is almost certainly still valid. Any
  // write that needs the server will still get a 401 and re-prompt.
  // Safe while the check is still in flight too: a confirmed signed-out visitor
  // is routed to the landing page below before this ever gates a render.
  const hasOfflineSession = Boolean(userId && (hasAuthError || isAuthLoading));
  const isAuthenticated = Boolean((isConnected || hasOfflineSession) && userId);
  const { minigameFrequency, setMinigameFrequency } = useMinigameFrequencyPreference();
  const { viewMode } = useViewModePreference();
  const {
    summary: goalSummary,
    isLoading: isGoalSummaryLoading,
    refresh: refreshGoalSummary,
  } = useGoalSummary(Boolean(userId && isHydrated), userId ?? 'anonymous');
  const goalDay = goalSummary?.days.find((day) => day.dayKey === goalSummary.today) ?? null;
  const goalPacing = useMemo<StudyPacing>(() => ({
    revealMode,
    minigameFrequency,
    fineTune: normalizeFineTuneConfig(learningFineTune),
  }), [learningFineTune, minigameFrequency, revealMode]);
  const { save: saveStudyGoal, pending: isSavingStudyGoal } = useSaveStudyGoal({
    revision: goalSummary?.goal.revision,
    pacing: goalPacing,
    onSaved: refreshGoalSummary,
  });
  const [isSavingReminderOnboarding, setIsSavingReminderOnboarding] = useState(false);
  const completeReminderOnboarding = useCallback(async ({
    enabled,
    localMinutes,
  }: {
    enabled: boolean;
    localMinutes: number;
  }) => {
    if (isSavingReminderOnboarding) return;
    setIsSavingReminderOnboarding(true);
    try {
      await syncUserData({
        goal_reminder_enabled: enabled,
        goal_reminder_local_minutes: localMinutes,
        goal_reminder_intro_answered: true,
      }, { emitEvent: false });
      if (!enabled) await unsubscribeFromStudyWebPush();
      await refreshGoalSummary();
      window.dispatchEvent(new Event('get-word:reschedule-reminders'));
    } finally {
      setIsSavingReminderOnboarding(false);
    }
  }, [isSavingReminderOnboarding, refreshGoalSummary]);
  useGoalReminders(goalSummary);
  const appReady =
    isHydrated &&
    !isInitialServerSyncPending &&
    !isGoalSummaryLoading &&
    (!isAuthLoading || hasOfflineSession) &&
    // The identity is part of being ready, not a second gate after the loader
    // has already been dismissed. Waiting for it here means the loader is shown
    // once, for the boot, and never thrown back over a running app because this
    // flag dipped for a render — which is a blink, not a load. A boot where the
    // identity never arrives still ends at `bootFailed` below.
    isAuthenticated;
  const displayEmail = userEmail ?? email ?? undefined;
  const displayAddress = userWalletAddress ?? undefined;

  const categories = useMemo(
    () => getAvailableCategories(activeWords),
    [activeWords]
  );

  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);

  // Callback ref: fires immediately when <main> mounts
  const phrasesCallbackRef = useCallback((node: HTMLElement | null) => {
    phrasesRef.current = node;
    setPhrasesScrollElement(node);
  }, []);

  // Trigger re-render when cards become due for review
  const dueTimerRevision = useDueTimer(progress);

  // Attach press handlers to cover targets (supports virtualized mounts).
  // Disabled in scratch mode, where the canvas overlay owns the reveal gesture.
  usePressHandlers(phrasesScrollElement, [selectedCategories, showAll, role], {
    enabled: revealMode === 'press',
    // The card deck can't scroll, so skip the scroll-vs-press delay and reveal on
    // contact — the stream view keeps the default delay to guard scrolling. When
    // swipe-to-grade is active, keep the delay so a swipe cancels the pending
    // press via move-detection instead of flashing the answer on gesture start.
    pressDelayMs: viewMode === 'card' && !deckSwipeActions ? 0 : 150,
  });

  const shouldRenderMemoryHook = useCallback(
    (wordId: string) => {
      const stageIndex = progress[wordId]?.stageIndex ?? 0;
      return shouldShowMemoryHookForStage(
        stageIndex,
        memoryHooksEnabled,
        memoryHookDisableFromStage
      );
    },
    [progress, memoryHooksEnabled, memoryHookDisableFromStage]
  );

  const personalListIds = useMemo(
    () =>
      new Set(
        subscribedLists
          .filter(
            (list) =>
              list.isPersonal === true &&
              list.languageFrom === learningLanguageFrom &&
              list.languageTo === learningLanguageTo,
          )
          .map((list) => list.id),
      ),
    [learningLanguageFrom, learningLanguageTo, subscribedLists],
  );

  // Fills the thin-distractor prompt in place instead of handing the learner off
  // to the chat. The prompt already carries the word it is about; all that
  // travels here is where the generated pair belongs and in which pair.
  const similarWordsContext = useMemo(() => ({
    languageFrom: learningLanguageFrom ?? '',
    languageTo: learningLanguageTo ?? '',
    baseListId: [...personalListIds][0] ?? null,
    onSaved: refreshFullSnapshot,
  }), [learningLanguageFrom, learningLanguageTo, personalListIds, refreshFullSnapshot]);

  const {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    settlingWords,
    streamGroups,
    dueNowCount,
    session,
    sessionBlockProgress,
    progressStats,
    upcomingAudioWords,
  } = useLearningPageState({
    filteredWords,
    selectedCategories,
    progress,
    isHydrated,
    viewMode,
    minigameFrequency,
    categoryOrder,
    pinnedCategoryIds,
    ownedPersonalListIds,
    dueTimerRevision,
    tiltGameEnabled,
    fineTuneConfig: learningFineTune,
    progressPlanRevision: isInitialServerSyncPending ? 'pending' : 'ready',
    studyGoal: (goalSummary?.goal.active as StudyGoalVersion | null | undefined) ?? null,
    isSessionDataReady:
      isHydrated &&
      !isInitialServerSyncPending &&
      (!isGoalSummaryLoading || bootTimedOut),
    sessionScopeKey: `pair:${normalizeLanguageCode(learningLanguageFrom ?? 'unknown')}:${normalizeLanguageCode(learningLanguageTo ?? 'unknown')}`,
    pendingAnsweredIds,
    continueAnyway,
    dayTargets: goalDay ? {
      resolvedNewTarget: goalDay.resolvedNewTarget,
      resolvedReviewTarget: goalDay.resolvedReviewTarget,
      resolvedItemBudget: goalDay.resolvedItemBudget,
    } : null,
  });

  useBackgroundTargetAudioRepair({
    words: upcomingAudioWords,
    // The background request can contain a mix of owned and subscribed items.
    // The server filters that mix to the caller's actual write permissions;
    // keeping the client broad means an owned public list is not missed merely
    // because its metadata does not expose ownership here.
    enabled: Boolean(appState.activeList),
    onRefresh: refreshFullSnapshot,
  });

  const {
    renderCard,
    renderMiniGame,
    renderCardForDeck,
    renderMiniGameForDeck,
    isTypingCard,
  } = useLearningRenderers({
    progress,
    role,
    showAll,
    getMemoryHook,
    getSuggestedMemoryHook,
    markKnown,
    markReallyKnown,
    markUnknown,
    setCustomStage,
    setMemoryHook,
    lastMovedId,
    showEnglish,
    showCategoryBadges,
    showPronunciation,
    categoryOrder,
    shouldRenderMemoryHook,
    studyNotesEnabled,
    studyNoteMinimizeFromStage,
    swipeCardsEnabled,
    fineTuneConfig: learningFineTune,
    distractorPool: filteredWords,
    typingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    dismissedGames,
    setDismissedGames,
    setGameScore,
    onAddSimilarWords: () => navigateSurface('chat'),
    similarWordsContext,
  });

  // No app session: signed-out visitors see the public landing page (below),
  // which explains the app and routes them to /login. The home page must stay
  // viewable without an account so its purpose is clear before signing in.
  // A failed identity check is *not* a signed-out state — it means we do not
  // know — so it gets the error screen rather than the landing page.
  const isSignedOut = !isAuthLoading && !isConnected && !hasAuthError;

  // The boot needs both an identity and a first sync payload. The error screen
  // is the last resort: only when neither the network nor the local cache can
  // supply them, since `isAuthenticated` already covers the offline case.
  const bootFailed = (hasAuthError || bootTimedOut) && !isAuthenticated;

  const retryBoot = useCallback(() => {
    if (hasAuthError) {
      retryAuth();
      return;
    }
    // A stalled sync leaves hydration state spread across this tree, IndexedDB
    // warm-start, and module-level sync identity; a full reload is the only
    // way to re-run boot from a known-clean state.
    window.location.reload();
  }, [hasAuthError, retryAuth]);

  useEffect(() => {
    if (loaderDismissed || (!appReady && !bootTimedOut)) return;
    const timeoutId = window.setTimeout(() => setLoaderDismissed(true), 220);
    return () => window.clearTimeout(timeoutId);
  }, [appReady, bootTimedOut, loaderDismissed]);

  useEffect(() => {
    if (appReady || loaderDismissed || bootTimedOut) return;
    const timeoutId = window.setTimeout(() => setBootTimedOut(true), BOOT_LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [appReady, bootTimedOut, loaderDismissed]);

  useEffect(() => {
    setAudioStorageLoggingEnabled(isEditor);
  }, [isEditor]);

  const forceShowMemoryHooksIntro = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('previewMemoryHooksIntro');
  }, []);

  const shouldShowMemoryHooksIntro = useMemo(
    () =>
      (forceShowMemoryHooksIntro && !memoryHooksIntroDismissedForSession) ||
      (viewMode === 'card' &&
        memoryHooksEnabled &&
        !memoryHooksIntroAnswered &&
        completedDeckWordCards >= 3),
    [
      completedDeckWordCards,
      forceShowMemoryHooksIntro,
      memoryHooksIntroDismissedForSession,
      memoryHooksEnabled,
      memoryHooksIntroAnswered,
      viewMode,
    ]
  );

  const handleEnableMemoryHooks = useCallback(() => {
    setMemoryHooksIntroDismissedForSession(true);
    setMemoryHooksEnabled(true);
    setMemoryHooksIntroAnswered(true);
  }, [setMemoryHooksEnabled, setMemoryHooksIntroAnswered]);

  const handleDisableMemoryHooks = useCallback(() => {
    setMemoryHooksIntroDismissedForSession(true);
    setMemoryHooksEnabled(false);
    setMemoryHooksIntroAnswered(true);
  }, [setMemoryHooksEnabled, setMemoryHooksIntroAnswered]);

  const memoryHooksIntroCard = shouldShowMemoryHooksIntro ? (
    <MemoryHooksIntroCard
      onEnableMemoryHooks={handleEnableMemoryHooks}
      onDisableMemoryHooks={handleDisableMemoryHooks}
      learningLanguageFrom={learningLanguageFrom}
      learningLanguageTo={learningLanguageTo}
    />
  ) : null;

  const {
    dismissPWAInstallIntro,
    isPreviewPWAActive,
    previewPWAInstallIntro,
    shouldShowPWAInstallIntro,
  } = usePWAInstallIntro({
    viewMode,
    shouldShowMemoryHooksIntro,
    completedDeckWordCards,
  });

  const pwaInstallIntroCard = shouldShowPWAInstallIntro ? (
    <PWAInstallIntroCard
      onDismiss={dismissPWAInstallIntro}
      simulatedPlatform={previewPWAInstallIntro.simulated}
    />
  ) : null;

  const shouldShowAddWordsPrompt = useMemo(
    () =>
      !addWordsPromptDismissedForSession &&
      Boolean(allSyncedWords) &&
      shouldOfferMorePersonalWords({
        words: allSyncedWords ?? EMPTY_WORDS,
        progress,
        personalListIds,
      }),
    [
      addWordsPromptDismissedForSession,
      allSyncedWords,
      personalListIds,
      progress,
    ],
  );
  const addWordsPrompt = shouldShowAddWordsPrompt ? (
    <AddPersonalWordsPrompt
      onAddWords={() => {
        navigateSurface('chat');
      }}
      onDismiss={() => setAddWordsPromptDismissedForSession(true)}
    />
  ) : null;
  const { finishFeatureTour, shouldShowFeatureTour } = useFeatureTour({
    activeSurface,
    completedDeckWordCards,
  });

  // The session flow drives both edge rails and the pause between blocks. The
  // breather takes the interstitial slot ahead of every other card: it is the
  // seam in the learner's own session, so nothing else should cut in front.
  const sessionFlow = useMemo(() => resolveSessionFlow(sessionBlockProgress), [sessionBlockProgress]);
  useEffect(() => {
    if (!sessionFlow.complete) return;
    void flushOutboxBeforeRead()
      .catch(() => undefined)
      .then(() => refreshGoalSummary());
  }, [refreshGoalSummary, sessionFlow.complete]);
  const { breather, dismiss: dismissBreather } = useSessionBreather(sessionFlow, sessionBlockProgress);
  // Only one of the two countdowns is ever live: the strip runs while work
  // remains, this one only once the day is closed. They never both tick.
  const dayResult = useStudyCountdown(
    goalDay,
    (goalSummary?.goal.active as StudyGoalVersion | null | undefined) ?? null,
    Boolean(goalSummary?.goal.active?.enabled) && sessionFlow.complete,
  );
  const sessionBreatherCard = breather ? (
    <SessionBreatherCard
      breather={breather}
      onContinue={dismissBreather}
      shortfall={session.dailyPlan?.shortfall ?? 0}
      // Live, not the plan's own count: words fall due during a session, so the
      // number frozen at planning time can already understate what is waiting —
      // and it has to agree with the Upcoming panel, which counts them live.
      extraReviewCount={continueAnyway ? 0 : dueNowCount}
      result={dayResult}
      onAddWords={() => {
        dismissBreather();
        navigateSurface('chat');
      }}
      onContinueExtra={() => {
        setContinueAnyway(true);
        dismissBreather();
      }}
    />
  ) : null;

  const interstitialCard =
    sessionBreatherCard ?? memoryHooksIntroCard ?? pwaInstallIntroCard ?? addWordsPrompt;
  const hasNoSelectedWordList = Boolean(
    onboardingCompletedAt &&
      learningLanguageFrom &&
      learningLanguageTo &&
      subscribedLists.length === 0
  );
  // Only someone without a list to study is still being set up, and only they
  // are asked for their level — so the request that answers it never runs for
  // the ordinary app open.
  const languageLevelStep = useLanguageLevelStep({
    enabled: hasNoSelectedWordList,
    languageFrom: learningLanguageFrom ?? null,
    languageTo: learningLanguageTo ?? null,
  });
  const onboardingStep = resolveLearningOnboardingStep({
    forceLanguage: forceOnboarding,
    hasNoSelectedWordList,
    onboardingCompleted: Boolean(onboardingCompletedAt),
    hasLanguagePair: Boolean(learningLanguageFrom && learningLanguageTo),
    languageLevelLoaded: languageLevelStep.loaded,
    hasLanguageLevel: languageLevelStep.level !== null,
    goalSummaryLoaded: goalSummary !== null,
    hasActiveGoal: Boolean(goalSummary?.goal.active?.enabled),
    reminderOnboardingAnswered: goalSummary?.reminder.onboardingAnswered ?? false,
  });
  const needsLanguageOnboarding = onboardingStep === 'language';
  const needsLanguageLevel = onboardingStep === 'level';
  const needsStudyGoal = onboardingStep === 'goal';
  const needsReminderOnboarding = onboardingStep === 'reminder';
  const needsFirstWords = onboardingStep === 'words';
  // Everything from the languages to the first list is one run of setup, and
  // the progress bar belongs to that run only — not to an existing learner who
  // reopened a screen from the menu.
  const isSettingUp = hasNoSelectedWordList || !onboardingCompletedAt;
  const landingPairFrom = landingLanguagePair?.from ?? null;
  const landingPairTo = landingLanguagePair?.to ?? null;
  const hasCompleteLandingPair = Boolean(
    landingPairFrom &&
      landingPairTo &&
      landingPairFrom !== landingPairTo
  );
  const shouldAdoptLandingPair = Boolean(
    needsLanguageOnboarding &&
      hasCompleteLandingPair &&
      landingLanguagePair?.wantsOwnList !== true &&
      landingLanguagePair?.consumed !== true &&
      !forceOnboarding
  );
  const onboardingInitialFrom = learningLanguageFrom ?? landingPairFrom;
  const onboardingInitialTo = learningLanguageTo ?? landingPairTo;

  /**
   * Save the languages and move on, which is what finishing the first step of
   * setup means. Shared by the Continue button, the landing-page hand-off, and
   * the last step, where the chat has just created the learner's first list.
   */
  const completeLanguagePair = useCallback(async (from: string, to: string) => {
    setIsOnboardingHandoffPending(true);
    try {
      await setLearningLanguages(from, to);
      // Apply the snapshot directly instead of only dispatching a background
      // refresh event: clearing the loader must mean the new words are already
      // in React state.
      await refreshFullSnapshot();
      if (forceOnboarding) {
        setForceOnboarding(false);
        // Drop the `?onboarding=1` param so a refresh doesn't replay it.
        const url = new URL(window.location.href);
        url.searchParams.delete('onboarding');
        url.searchParams.delete('wordChat');
        window.history.replaceState(window.history.state, '', url.toString());
      }
      if (forceWordChat) replaceSurface('chat');
    } finally {
      setIsOnboardingHandoffPending(false);
    }
  }, [forceOnboarding, forceWordChat, refreshFullSnapshot, replaceSurface, setLearningLanguages]);

  // The landing-page hand-off fires only once: the learner already answered the
  // language question there, so adopt the pair and let setup carry on at the
  // next step instead of asking again. Flagging it consumed keeps a later
  // refresh on the ordinary pre-filled screen.
  const adoptedLandingPairRef = useRef(false);
  useEffect(() => {
    if (!shouldAdoptLandingPair || adoptedLandingPairRef.current) return;
    adoptedLandingPairRef.current = true;
    markLandingLanguagePairConsumed();
    if (!landingPairFrom || !landingPairTo) return;
    // Deferred only to keep the save out of the effect body; the ref above
    // already guarantees it runs once.
    window.setTimeout(() => void completeLanguagePair(landingPairFrom, landingPairTo), 0);
  }, [completeLanguagePair, landingPairFrom, landingPairTo, shouldAdoptLandingPair]);

  useEffect(() => {
    if (needsLanguageOnboarding || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('wordChat') !== '1') return;
    replaceSurface('chat');
    // Deferred only because a synchronous setState in an effect body is a lint
    // error here, and deliberately NOT cancelled on cleanup: `replaceSurface`
    // has already stripped the param, so a re-run cannot repeat this, while
    // cancelling would leave the flag armed and auto-open the chat again on a
    // later onboarding visit.
    window.setTimeout(() => setForceWordChat(false), 0);
  }, [needsLanguageOnboarding, replaceSurface]);

  return (
    <AppStateProvider value={appState}>
      <I18nProvider language={appState.settingsLanguage}>
        {isEditor ? <AudioStorageDebugBadge /> : null}
        {bootFailed ? (
          <BootErrorScreen onRetry={retryBoot} />
        ) : isSignedOut ? (
          // Public landing page: explains the app without requiring a login.
          <LandingPage />
        ) : !loaderDismissed ? (
          <LoadingScreen />
        ) : isOnboardingHandoffPending ? (
          <LoadingScreen />
        ) : isListRefreshPending && !onboardingCompletedAt ? (
          <LoadingScreen />
        ) : needsLanguageOnboarding ? (
          <LearningLanguageOnboarding
            phase="languages"
            showProgress={isSettingUp}
            initialFrom={onboardingInitialFrom}
            initialTo={onboardingInitialTo}
            accountEmail={displayEmail}
            onSignOut={signOut}
            autoOpenWordChat={forceWordChat}
            // Only someone who is already set up can walk away from this screen;
            // for everyone else it is the required first step.
            onExit={
              isSettingUp
                ? undefined
                : () => {
                    setForceWordChat(false);
                    setForceOnboarding(false);
                  }
            }
            onComplete={completeLanguagePair}
            onSelectList={setActiveListId}
          />
        ) : onboardingStep === 'loading' ? (
          <LoadingScreen />
        ) : needsLanguageLevel ? (
          <LanguageLevelOnboarding
            targetLanguage={learningLanguageTo}
            initialLevel={languageLevelStep.level}
            pending={languageLevelStep.saving}
            onSubmit={(level) => void languageLevelStep.save(level)}
          />
        ) : needsStudyGoal ? (
          <StudyGoalSetupCard
            pacing={goalPacing}
            pending={isSavingStudyGoal}
            showProgress={isSettingUp}
            onSave={(value) => void saveStudyGoal(value)}
          />
        ) : needsReminderOnboarding ? (
          <StudyReminderOnboarding
            initialMinutes={goalSummary?.reminder.localMinutes ?? 19 * 60}
            pending={isSavingReminderOnboarding}
            showProgress={isSettingUp}
            onComplete={(value) => void completeReminderOnboarding(value)}
          />
        ) : needsFirstWords ? (
          // The last step: the chat now knows the languages, the level, and how
          // much study the learner signed up for, so it can propose a first list
          // that fits instead of asking for all of that itself.
          <LearningLanguageOnboarding
            phase="words"
            showProgress
            autoOpenWordChat
            initialFrom={onboardingInitialFrom}
            initialTo={onboardingInitialTo}
            accountEmail={displayEmail}
            onSignOut={signOut}
            onComplete={completeLanguagePair}
            onSelectList={setActiveListId}
          />
        ) : (
          <>
            {shouldShowFeatureTour && <FeatureTour onFinish={finishFeatureTour} />}
            <LearningStudyContent
              // Force card view when previewing the PWA install screen — the
              // interstitial only renders inside the card deck.
              viewMode={isPreviewPWAActive ? 'card' : viewMode}
              minigameFrequency={minigameFrequency}
              onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
              isAuthenticated={isAuthenticated}
              authEmail={displayEmail}
              school={school}
              authAddress={displayAddress}
              onSignOut={signOut}
              onOpenWordChat={() => navigateSurface('chat')}
              onOpenPhotoLab={() => navigateSurface('photo')}
              learningLanguagePair={
                learningLanguageFrom && learningLanguageTo
                  ? { from: learningLanguageFrom, to: learningLanguageTo }
                  : null
              }
              studyEmptyForPair={isStudyEmptyForPair}
              photoLabAvailable={photoLabEnabled}
              onLearningLanguagePairChange={changeLearningLanguagePair}
              activeSurface={activeSurface}
              onSurfaceChange={navigateSurface}
              chatContent={
                visitedSurfaces.has('chat') ? (
                  <AddWordsScreen
                    languageFrom={learningLanguageFrom as string}
                    languageTo={learningLanguageTo as string}
                    baseListId={
                      activeListMatchesLearningPair &&
                      !appState.activeList?.isOwnedPersonal
                        ? appState.activeListId
                        : null
                    }
                    refreshAfterCommit={refreshFullSnapshot}
                    onLanguagePairChange={changeLearningLanguagePair}
                    onClose={returnToStudy}
                    active={activeSurface === 'chat'}
                    onCommitted={(result) => {
                      // Normally personal words overlay the current base list,
                      // so keep studying that base. After a pair change with no
                      // existing matching list, the newly created personal list
                      // is the first valid study surface for the new pair.
                      if (!activeListMatchesLearningPair) setActiveListId(result.listId);
                    }}
                  />
                ) : undefined
              }
              photoContent={
                visitedSurfaces.has('photo') && photoLabEnabled ? (
                  <div className={photoDisplayFontClass ?? ''}>
                    <PhotoLabPage
                      onClose={returnToStudy}
                      variant="embedded"
                      active={activeSurface === 'photo'}
                      languageFrom={learningLanguageFrom as string}
                      languageTo={learningLanguageTo as string}
                      onLanguagePairChange={changeLearningLanguagePair}
                      onSavedToList={(result) => {
                        // Same rule as the word chat: personal words overlay
                        // the current base list, so keep studying it — unless
                        // it belongs to another pair, in which case the list
                        // just saved into is the only surface showing them.
                        if (!activeListMatchesLearningPair) setActiveListId(result.listId);
                        void refreshFullSnapshot();
                      }}
                    />
                  </div>
                ) : undefined
              }
              categories={categories}
              progressStats={progressStats}
              phrasesCallbackRef={phrasesCallbackRef}
              phrasesScrollElement={phrasesScrollElement}
              filteredWords={filteredWords}
              interstitialCard={interstitialCard}
              onDeckWordCardCompleted={(word) => {
                setCompletedDeckWordCards((count) => count + 1);
                setPendingAnsweredIds((previous) => new Set(previous).add(word.id));
              }}
              deckSwipeActions={deckSwipeActions}
              isSwipeBlockedForWord={isTypingCard}
              streamGroups={streamGroups}
              sessionFlow={sessionFlow}
              renderCardForDeck={renderCardForDeck}
              renderMiniGameForDeck={renderMiniGameForDeck}
              renderCard={renderCard}
              renderMiniGame={renderMiniGame}
              showNotReady={showNotReady}
              settlingCount={settlingWords.length}
              // The closing card must not claim "nothing due" while the plan's
              // leftovers are still due; it offers them instead, on the same
              // opt-in as the breather's extra-review button.
              dueNowCount={continueAnyway ? 0 : dueNowCount}
              onStudyExtra={() => setContinueAnyway(true)}
              onToggleShowNotReady={() => setShowNotReady(!showNotReady)}
            />
          </>
        )}
      </I18nProvider>
    </AppStateProvider>
  );
}
