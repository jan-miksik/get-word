'use client';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { LearningStudyContent } from '@/features/learning/components/LearningStudyContent';
import { LearningAddWordsSurface } from '@/features/learning/components/LearningAddWordsSurface';
import { LearningOnboardingContent } from '@/features/learning/components/LearningOnboardingContent';
import { useViewModePreference } from '@/features/learning/app-state/useViewModePreference';
import { useMinigameFrequencyPreference } from '@/features/learning/hooks/useMinigameFrequencyPreference';
import { useLearningPageState } from '@/features/learning/hooks/useLearningPageState';
import { usePressHandlers } from '@/features/learning/hooks/usePressHandlers';
import { useLearningRenderers } from '@/features/learning/hooks/useLearningRenderers';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import { countIntroducedOnDay } from '@/features/learning/session/dayProgress';
import { useSessionBreather } from '@/features/learning/session/useSessionBreather';
import { useBonusWork } from '@/features/learning/session/useBonusWork';
import { useSessionCompletions } from '@/features/learning/hooks/useSessionCompletions';
import { setActivitySurfaceOverride } from '@/lib/activity/runtime';
import { SessionBreatherCard } from '@/features/learning/components/SessionBreatherCard';
import { SessionPreflightCard } from '@/features/learning/components/SessionPreflightCard';
import { SessionTimeTransitionCard } from '@/features/learning/components/SessionTimeTransitionCard';
import {
  SessionTimeNewWordsCard,
  SessionTimeNoPracticeCard,
  SessionTimePracticePendingCard,
} from '@/features/learning/components/SessionTimePhaseEmptyCard';
import { planSessionPreflight } from '@/features/learning/session/preflight';
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
import {
  readLandingLanguagePair,
  markLandingLanguagePairConsumed,
} from '@/features/shared/languages/landingPairStorage';
import { MemoryHooksIntroCard } from '@/features/learning/components/MemoryHooksIntroCard';
import { useSurveyPromptCard } from '@/features/learning/surveys/useSurveyPromptCard';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import { AddPersonalWordsPrompt } from '@/features/learning/components/AddPersonalWordsPrompt';
import { usePWAInstallIntro } from '@/features/learning/hooks/usePWAInstallIntro';
import { FeatureTour } from '@/features/learning/onboarding/FeatureTour';
import { useFeatureTour } from '@/features/learning/onboarding/useFeatureTour';
import { shouldOfferMorePersonalWords } from '@/features/learning/personalWordsPrompt';
import { QuickPracticeRun } from '@/features/learning/quick-practice/QuickPracticeRun';
import { useQuickPractice } from '@/features/learning/quick-practice/useQuickPractice';
import { useAppSurface, type AppSurface } from '@/features/workspace/public.client';
import {
  migrateDraftToLanguagePair,
  readAddWordsTab,
} from '@/features/word-chat/client/storage';
import { normalizeLanguageCode } from '@/lib/i18n/languages';
import { useBackgroundTargetAudioRepair } from '@/features/learning/hooks/useBackgroundTargetAudioRepair';
import { chooseBaseStudyListForPair } from '@/features/learning/state/study-list-selection';
import { flushOutboxBeforeRead } from '@/lib/local-first/drainer';
import { useGoalSummary } from '@/features/learning/goals/useGoalSummary';
import { resolveStreakData } from '@/features/learning/goals/streakWeek';
import { ProgressOverviewPanel } from '@/features/learning/components/progress/ProgressOverviewPanel';
import { useGoalReminders } from '@/features/learning/goals/useGoalReminders';
import { hasIntroducedWord, type StudyGoalVersion, type StudyPacing } from '@/packages/domain/goals/goal';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import { useSaveStudyGoal } from '@/features/learning/goals/useSaveStudyGoal';
import {
  applyOnboardingBack,
  hasConfiguredGoal,
  holdOnboardingStepWhileLoading,
  onboardingBackTarget,
  resolveLearningOnboardingStep,
  type LearningOnboardingStep,
} from '@/features/learning/onboarding/flow';
import { useLanguageLevelStep } from '@/features/learning/onboarding/useLanguageLevelStep';
import { OnboardingProgressNavigationProvider } from '@/features/learning/onboarding/OnboardingProgressNavigation';
import { unsubscribeFromStudyWebPush } from '@/features/learning/goals/web-push';
import { syncUserData } from '@/lib/sync';

const BOOT_LOADING_TIMEOUT_MS = 12_000;

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
  // Latest-ref indirection because useAppState (the actual source of
  // incrementSurveyProgress) is called further down, after this hook.
  const incrementSurveyProgressRef = useRef<() => void>(() => {});
  // Stable by construction — the ref above is what absorbs the change, so this
  // must never be an inline arrow: `recordAnswerGiven` depends on it, and
  // through `handleCardCompleted` so does every memoised stream renderer.
  const notifyAnswerRecorded = useCallback(() => incrementSurveyProgressRef.current(), []);
  // Work this session has finished but the server has not caught up with yet.
  const {
    completedDeckWordCards,
    pendingAnswers, completedGameIds, answeredWords,
    recordAnswerGiven, recordDeckCardCompleted, recordGameFinished,
  } = useSessionCompletions(notifyAnswerRecorded);
  const [continueAnyway, setContinueAnyway] = useState(false);
  const [memoryHooksIntroDismissedForSession, setMemoryHooksIntroDismissedForSession] = useState(false);
  const [preflightDismissed, setPreflightDismissed] = useState(false);
  const [addWordsPromptDismissedForSession, setAddWordsPromptDismissedForSession] =
    useState(false);
  // Completing the last onboarding step updates the language preference
  // synchronously, but the newly created list reaches the study stream through
  // a fresh snapshot. Keep the global loader only for that final handoff — the
  // first language step already has everything it needs locally to move on.
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
    typingCheckButtonEnabled,
    typingAudioReplayHideFromStage,
    markKnown,
    markReallyKnown,
    markStay,
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
    surveyProgressCount,
    surveyResponses,
    surveyEligibility,
    submitSurveyResponse,
    dismissSurvey,
    incrementSurveyProgress,
  } = appState;
  useEffect(() => {
    incrementSurveyProgressRef.current = incrementSurveyProgress;
  }, [incrementSurveyProgress]);
  const {
    activeSurface,
    navigateSurface,
    replaceSurface,
    returnToStudy,
    visitedSurfaces,
  } = useAppSurface(photoLabEnabled);
  // "Add words" reopens on the way in the learner used last. Only the two
  // addresses are decided here — typing versus the conversation is settled
  // inside the screen, which is the only place that knows whether a draft is
  // waiting. Offers that name a way in ("take a photo", "add similar words")
  // still override it: they were asked for by name.
  const openAddWords = useCallback(() => {
    navigateSurface(readAddWordsTab() === 'photo' && photoLabEnabled ? 'photo' : 'chat');
  }, [navigateSurface, photoLabEnabled]);
  // The menu's own switcher goes through the same door: "Add your own words"
  // there names the errand, not a tab, so it should land where the learner was
  // working last. Asking for the photo tab by name still means the photo tab.
  const changeSurface = useCallback(
    (surface: AppSurface) => {
      if (surface === 'chat') openAddWords();
      else navigateSurface(surface);
    },
    [navigateSurface, openAddWords],
  );
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
    if (isSavingReminderOnboarding) return false;
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
      return true;
    } catch (error) {
      console.error('[study-goal] failed to save reminder onboarding:', error);
      return false;
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

  // A minutes goal is measured by its countdown instead of by the item rails.
  // The budget is the day's own resolved one, so a goal edited today cannot
  // rewrite a day already under way, and the bonus round past the plan keeps
  // the item rails: its time was never budgeted, so counting it down would only
  // ever draw an empty clock.
  const sessionTimeGoal = useMemo(() => {
    if (continueAnyway) return null;
    if (!goalSummary?.goal.active?.enabled) return null;
    if (!goalDay || goalDay.goalMode !== 'minutes' || goalDay.goalStatus !== 'active') return null;
    const minutes = goalDay.resolvedMinutesBudget ?? goalDay.goalMinutes ?? 0;
    if (minutes <= 0) return null;
    return {
      dayKey: goalDay.dayKey,
      // The summary's own zone, so the client buckets measured time under the
      // same day key the server drew that day in.
      timezone: goalSummary.timezone,
      budgetMs: minutes * 60_000,
      serverActiveMs: goalDay.activeMs,
    };
  }, [continueAnyway, goalDay, goalSummary]);
  const {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    settlingWords,
    streamGroups,
    dueNowCount,
    newNowCount,
    session,
    sessionBlockProgress,
    progressStats,
    upcomingAudioWords,
    bonusBlockProgress,
    timePhase: sessionTimePhase,
    timePhaseKinds,
    timePhaseEmptyKind,
    timeTransition,
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
    pendingAnswers,
    completedGameIds,
    continueAnyway,
    timeGoal: sessionTimeGoal,
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
  // Stable so the deck's card renderers are not rebuilt on every render of this
  // page; it reads the same `progress` those renderers already depend on.
  const handleCardCompleted = useCallback((word: NormalizedWord) => recordAnswerGiven(word, progress), [progress, recordAnswerGiven]);
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
    markStay,
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
    typingCheckButtonEnabled,
    typingAudioReplayHideFromStage,
    dismissedGames,
    setDismissedGames,
    setGameScore,
    onGameFinished: recordGameFinished,
    onCardCompleted: handleCardCompleted,
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

  const surveyPromptCard = useSurveyPromptCard({
    surveyProgressCount, surveyResponses, surveyEligibility, submitSurveyResponse, dismissSurvey,
  });

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

  // A finished day with an empty schedule still leaves people who want to carry
  // on. The block behind this is the one way to: existing exercises over words
  // they already have, with nothing written back. It is built from the study
  // scope, so category filters apply to it exactly as they do to the deck.
  // A practice card is the study card with its schedule wiring cut, so it still
  // reads the display settings the learner chose for the deck. Nothing that
  // writes is in here — that is the whole distinction the block rests on.
  const practiceCardSettings = useMemo(() => ({
    progress,
    showEnglish,
    showCategoryBadges,
    showPronunciation,
    categoryOrder,
    studyNotesEnabled,
    studyNoteMinimizeFromStage,
    typingPrefillPunctuation,
    typingCheckButtonEnabled,
    typingAudioReplayHideFromStage,
  }), [
    categoryOrder,
    progress,
    showCategoryBadges,
    showEnglish,
    showPronunciation,
    studyNoteMinimizeFromStage,
    studyNotesEnabled,
    typingCheckButtonEnabled,
    typingPrefillPunctuation,
    typingAudioReplayHideFromStage,
  ]);
  // A practice block writes no spaced-repetition stage, but a correct answer
  // still earns its point — the same one a session card gives, never negative,
  // so the score cannot fall on a bonus round.
  const addPracticeScore = useCallback(
    (points: number) => {
      if (points > 0) setGameScore((prev) => Math.max(0, prev + points));
    },
    [setGameScore],
  );
  const quickPractice = useQuickPractice({ words: filteredWords, progress, role });
  const timePracticeWords = useMemo(() => {
    const introduced = filteredWords.filter((word) => hasIntroducedWord(progress[word.id]));
    // Prefer genuine review material. A completely new learner who skipped an
    // empty new phase can still use newly added words as progress-free cards.
    return introduced.length > 0 ? introduced : filteredWords;
  },
    [filteredWords, progress],
  );
  // Review time is allowed to continue without moving SRS once every due card
  // has been answered. Even one word can support a typing card.
  const timeQuickPractice = useQuickPractice({
    words: timePracticeWords,
    progress,
    role,
    minimumWords: 1,
  });

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
        openAddWords();
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
  const sessionTimePhaseCount = session.dailyPlan?.timePhaseShares?.length;
  const sessionFlow = useMemo(
    () => resolveSessionFlow(sessionBlockProgress, sessionTimePhase, sessionTimePhaseCount),
    [sessionBlockProgress, sessionTimePhase, sessionTimePhaseCount],
  );
  const needsTimePractice = timePhaseEmptyKind === 'review';
  useEffect(() => {
    let timer: number | undefined;
    if (needsTimePractice && timeQuickPractice.available && !timeQuickPractice.rounds) {
      timer = window.setTimeout(timeQuickPractice.start, 0);
    } else if (!needsTimePractice && timeQuickPractice.rounds) {
      timer = window.setTimeout(timeQuickPractice.finish, 0);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [needsTimePractice, timeQuickPractice.available, timeQuickPractice.finish, timeQuickPractice.rounds, timeQuickPractice.start]);
  // Carrying on past the day still deserves a sense of how far the stretch runs.
  // The bonus round has its own frozen plan, so it gets its own rail; the day's
  // own flow keeps driving the breather and the closing card either way.
  const bonusFlow = useMemo(() => resolveSessionFlow(bonusBlockProgress), [bonusBlockProgress]);
  const railFlow = continueAnyway && bonusFlow.dayTotal > 0 ? bonusFlow : sessionFlow;
  const railBlocks = continueAnyway && bonusFlow.dayTotal > 0 ? bonusBlockProgress : sessionBlockProgress;
  // The closing card quotes the server's count of the day, so the rollup has to
  // be refreshed at every point that card can appear: when the plan is walked,
  // and again when a bonus round taken on top of it runs out. Without the
  // second read the card would report the day as it stood before the bonus.
  const bonusClosed = continueAnyway && bonusFlow.dayTotal > 0 && bonusFlow.settled;
  const extraScope = `${goalSummary?.today ?? 'day'}|${session.planIdentity ?? 'unplanned'}`;
  const { extra, startBonusRound } = useBonusWork({ closed: bonusClosed, flow: bonusFlow,
    scope: extraScope, setContinuing: setContinueAnyway });
  useEffect(() => {
    // Settled, not complete: the day closes on the answer, but the rollup this
    // reads is written from the answer that is still on its way to the server.
    if (!sessionFlow.settled && !bonusClosed) return;
    void flushOutboxBeforeRead()
      .catch(() => undefined)
      .then(() => {
        if (bonusClosed) setContinueAnyway(false);
        return refreshGoalSummary();
      });
  }, [bonusClosed, refreshGoalSummary, sessionFlow.settled]);
  const { breather, dismiss: dismissBreather } = useSessionBreather(railFlow, railBlocks, answeredWords,
    `${session.planIdentity ?? 'unplanned'}:${continueAnyway ? 'bonus' : 'day'}`);
  const effectiveSessionShortfall = sessionTimeGoal ? 0 : session.dailyPlan?.shortfall ?? 0;
  // One derivation for both surfaces, so the chip in the bar and the card that
  // closes the day can never disagree about the same week.
  const dayClosedLocally = Boolean(goalDay?.met) || (sessionFlow.complete && effectiveSessionShortfall === 0);
  // The bonus ledger counts answer events immediately, while the server's day
  // rollup can still be one sync behind (and deliberately counts distinct
  // words). Once the learner has completed explicit work past the closed plan,
  // today's bead should earn its star on this render rather than on a later
  // visit.
  const dayExceededLocally = (extra?.reviewed ?? 0) + (extra?.fresh ?? 0) > 0;
  const streak = useMemo(
    () => goalSummary
      ? resolveStreakData(goalSummary, {
          optimisticTodayComplete: dayClosedLocally,
          optimisticTodayExceeded: dayExceededLocally,
        })
      : null,
    [dayClosedLocally, dayExceededLocally, goalSummary],
  );
  // What the day amounted to, counted by the server rather than by the plan:
  // the plan can only ever report its own cap back, and the learner may well
  // have gone past it. A words goal also gives the card something to exceed.
  const localIntroducedToday = useMemo(
    () => goalSummary
      ? countIntroducedOnDay(progress, goalSummary.today, goalSummary.timezone)
      : 0,
    [goalSummary, progress],
  );
  const dayScore = useMemo(
    () =>
      goalDay
        ? {
            introduced: Math.max(goalDay.introducedWords, localIntroducedToday),
            reviewed: goalDay.reviewedWords,
            target:
              goalDay.goalMode === 'words'
                ? (goalDay.resolvedNewTarget ?? 0) + (goalDay.resolvedReviewTarget ?? 0)
                : null,
            met: goalDay.met,
          }
        : null,
    [goalDay, localIntroducedToday],
  );
  const sessionBreatherCard = breather && !sessionTimeGoal ? (
    <SessionBreatherCard
      breather={breather}
      onContinue={dismissBreather}
      showDayProgress={!sessionTimeGoal}
    />
  ) : null;
  const timeTransitionCard = timeTransition ? (
    <SessionTimeTransitionCard onContinue={timeTransition.dismiss} />
  ) : null;
  const timePhaseEmptyCard = timePhaseEmptyKind === 'new' ? (
    <SessionTimeNewWordsCard onAddWords={openAddWords} />
  ) : needsTimePractice && !timeQuickPractice.available ? (
    <SessionTimeNoPracticeCard onAddWords={openAddWords} />
  ) : needsTimePractice && !timeQuickPractice.rounds ? (
    <SessionTimePracticePendingCard />
  ) : null;

  // Before the day's first card, and only there: the clock now credits studying
  // alone, so a trip to the chat mid-session costs the learner the trip. If the
  // plan already knows the lists cannot fill the day, say so while it is free.
  const preflight = useMemo(
    () =>
      planSessionPreflight({
        // A minutes session asks the live phase resolver whether material is
        // actually missing. Its compatibility item plan is not a quota and must
        // never put an add-words screen in front of an already stocked deck.
        plan: sessionTimeGoal ? null : session.dailyPlan,
        goalEnabled: Boolean(goalSummary?.goal.active?.enabled),
        goalStatus: goalDay?.goalStatus ?? null,
        // The live plan, not the server rollup: the summary lags a sync behind,
        // and this card must disappear on the first answer.
        answeredToday: sessionFlow.dayDone + sessionFlow.dayPending,
        dismissed: preflightDismissed || continueAnyway,
      }),
    [
      continueAnyway,
      goalDay?.goalStatus,
      goalSummary?.goal.active?.enabled,
      preflightDismissed,
      session.dailyPlan,
      sessionFlow.dayDone,
      sessionFlow.dayPending,
      sessionTimeGoal,
    ],
  );
  const preflightCard = preflight ? (
    <SessionPreflightCard
      preflight={preflight}
      onAddWords={() => {
        setPreflightDismissed(true);
        openAddWords();
      }}
      onStartAnyway={() => setPreflightDismissed(true)}
    />
  ) : null;

  const interstitialCard =
    timeTransitionCard ?? timePhaseEmptyCard ?? sessionBreatherCard ?? preflightCard ?? surveyPromptCard ?? memoryHooksIntroCard ?? pwaInstallIntroCard ?? addWordsPrompt;
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
  const resolvedGateStep = resolveLearningOnboardingStep({
    forceLanguage: forceOnboarding,
    hasNoSelectedWordList,
    onboardingCompleted: Boolean(onboardingCompletedAt),
    hasLanguagePair: Boolean(learningLanguageFrom && learningLanguageTo),
    languageLevelLoaded: languageLevelStep.loaded,
    hasLanguageLevel: languageLevelStep.level !== null,
    goalSummaryLoaded: goalSummary !== null,
    hasConfiguredGoal: hasConfiguredGoal(goalSummary?.goal),
    reminderOnboardingAnswered: goalSummary?.reminder.onboardingAnswered ?? false,
  });
  // The last step actually put on screen, so a gap while the next one's answer
  // is still being fetched can hold it instead of blinking the boot loader in.
  // Written after the commit that showed it, which is what leaves it pointing
  // at the *previous* step during the render that would otherwise load.
  const lastRenderedOnboardingStepRef = useRef<LearningOnboardingStep | null>(null);
  const resolvedOnboardingStep = holdOnboardingStepWhileLoading(
    resolvedGateStep,
    // eslint-disable-next-line react-hooks/refs -- this is render history, not render-driving state
    lastRenderedOnboardingStepRef.current,
  );
  useEffect(() => {
    lastRenderedOnboardingStepRef.current = resolvedOnboardingStep;
  }, [resolvedOnboardingStep]);
  // Where Back has sent the learner, if anywhere. Every step reads its saved
  // answer, so going back shows what they chose rather than a blank card; the
  // override is dropped the moment a step is submitted, which is what lets the
  // stored answers take the flow forward again.
  const [onboardingBackStep, setOnboardingBackStep] = useState<LearningOnboardingStep | null>(null);
  const onboardingStep = applyOnboardingBack(resolvedOnboardingStep, onboardingBackStep);
  const needsLanguageOnboarding = onboardingStep === 'language';
  const needsLanguageLevel = onboardingStep === 'level';
  const needsStudyGoal = onboardingStep === 'goal';
  const needsReminderOnboarding = onboardingStep === 'reminder';
  const needsFirstWords = onboardingStep === 'words';
  const onboardingSurfaceActive =
    needsLanguageOnboarding ||
    needsLanguageLevel ||
    needsStudyGoal ||
    needsReminderOnboarding ||
    needsFirstWords;
  // These screens all render in place on `/`. Without an override the router
  // calls every one of them `study`, including the reminder form and the first
  // word-chat run after a minutes goal has already been saved.
  useEffect(() => {
    setActivitySurfaceOverride(
      timeTransition
        ? 'other'
        : onboardingSurfaceActive
        ? 'onboarding'
        : activeSurface === 'chat'
          ? 'word_chat'
          : activeSurface === 'photo'
            ? 'photo_lab'
            : null,
    );
    return () => setActivitySurfaceOverride(null);
  }, [activeSurface, onboardingSurfaceActive, timeTransition]);
  // Everything from the languages to the first list is one run of setup, and
  // the progress bar belongs to that run only — not to an existing learner who
  // reopened a screen from the menu.
  const isSettingUp = hasNoSelectedWordList || !onboardingCompletedAt;
  const backTarget = onboardingBackTarget(onboardingStep, { isSettingUp });
  const leaveLanguageScreen = isSettingUp
    ? undefined
    : () => {
        setForceWordChat(false);
        setForceOnboarding(false);
      };
  // A scheduled change is what the learner last chose, so it — not the running
  // version — is what the goal step reopens on.
  const editableGoal = goalSummary?.goal.pending ?? goalSummary?.goal.active ?? null;
  const goToPreviousOnboardingStep = backTarget
    ? () => setOnboardingBackStep(backTarget)
    : undefined;
  /** Hand the flow back to the stored answers, which now point forwards. */
  const leaveOnboardingStep = () => setOnboardingBackStep(null);
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
  const completeLanguagePair = useCallback(async (
    from: string,
    to: string,
    { refreshStudySnapshot = false }: { refreshStudySnapshot?: boolean } = {},
  ) => {
    setOnboardingBackStep(null);
    if (refreshStudySnapshot) setIsOnboardingHandoffPending(true);
    try {
      await setLearningLanguages(from, to);
      if (refreshStudySnapshot) {
        // Apply the snapshot directly instead of only dispatching a background
        // refresh event: clearing the loader must mean the new words are already
        // in React state.
        await refreshFullSnapshot();
      }
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
      if (refreshStudySnapshot) setIsOnboardingHandoffPending(false);
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
        ) : onboardingStep !== 'app' ? (
          <OnboardingProgressNavigationProvider onNavigate={setOnboardingBackStep}>
            <LearningOnboardingContent
              step={onboardingStep}
              isSettingUp={isSettingUp}
              initialFrom={onboardingInitialFrom}
              initialTo={onboardingInitialTo}
              accountEmail={displayEmail}
              forceWordChat={forceWordChat}
              languageScreenExit={leaveLanguageScreen}
              targetLanguage={learningLanguageTo}
              languageLevel={languageLevelStep.level}
              languageLevelSaving={languageLevelStep.saving}
              goalRevision={goalSummary?.goal.revision}
              goalPacing={goalPacing}
              goalSaving={isSavingStudyGoal}
              editableGoal={editableGoal}
              reminderMinutes={goalSummary?.reminder.localMinutes ?? 19 * 60}
              reminderSaving={isSavingReminderOnboarding}
              onSignOut={signOut}
              onBack={goToPreviousOnboardingStep}
              onLeaveStep={leaveOnboardingStep}
              onCompleteLanguagePair={completeLanguagePair}
              onSelectList={setActiveListId}
              onSaveLanguageLevel={languageLevelStep.save}
              onSaveGoal={saveStudyGoal}
              onCompleteReminder={completeReminderOnboarding}
            />
          </OnboardingProgressNavigationProvider>
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
              onOpenWordChat={openAddWords}
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
              onSurfaceChange={changeSurface}
              chatContent={visitedSurfaces.has('chat') || visitedSurfaces.has('photo') ? (
                <LearningAddWordsSurface
                  languageFrom={learningLanguageFrom as string}
                  languageTo={learningLanguageTo as string}
                  baseListId={
                    activeListMatchesLearningPair && !appState.activeList?.isOwnedPersonal
                      ? appState.activeListId
                      : null
                  }
                  activeSurface={activeSurface}
                  visitedSurfaces={visitedSurfaces}
                  photoLabEnabled={photoLabEnabled}
                  photoDisplayFontClass={photoDisplayFontClass}
                  refreshAfterCommit={refreshFullSnapshot}
                  onLanguagePairChange={changeLearningLanguagePair}
                  onClose={returnToStudy}
                  onReplaceSurface={replaceSurface}
                  onCommitted={(listId) => {
                    if (!activeListMatchesLearningPair) setActiveListId(listId);
                  }}
                />
              ) : undefined}
              // Mounted only once the learner has been there, and kept mounted
              // afterwards, so the overview costs nothing on a session that
              // never opens it and nothing to reopen.
              progressContent={visitedSurfaces.has('progress') ? (
                <ProgressOverviewPanel
                  progressStats={progressStats}
                  goalDay={goalDay}
                  streak={streak}
                />
              ) : undefined}
              practice={
                timeQuickPractice.rounds ? {
                  run: (
                    <QuickPracticeRun
                      rounds={timeQuickPractice.rounds}
                      index={timeQuickPractice.index}
                      role={role}
                      settings={practiceCardSettings}
                      onAdvance={timeQuickPractice.advance}
                      onFinish={timeQuickPractice.finish}
                      onScore={addPracticeScore}
                    />
                  ),
                  done: timeQuickPractice.index,
                  total: timeQuickPractice.rounds.length,
                  timed: true,
                } : quickPractice.rounds ? {
                  run: (
                    <QuickPracticeRun
                      rounds={quickPractice.rounds}
                      index={quickPractice.index}
                      role={role}
                      settings={practiceCardSettings}
                      onAdvance={quickPractice.advance}
                      onFinish={quickPractice.finish}
                      onScore={addPracticeScore}
                    />
                  ),
                  done: quickPractice.index,
                  total: quickPractice.rounds.length,
                } : null
              }
              categories={categories}
              phrasesCallbackRef={phrasesCallbackRef}
              phrasesScrollElement={phrasesScrollElement}
              filteredWords={filteredWords}
              interstitialCard={interstitialCard}
              onDeckWordCardCompleted={(word) => recordDeckCardCompleted(word, progress)}
              deckSwipeActions={deckSwipeActions}
              isSwipeBlockedForWord={isTypingCard}
              streamGroups={streamGroups}
              sessionFlow={railFlow}
              sessionRailHeldBlock={sessionBreatherCard ? breather?.finished ?? null : null}
              sessionTimeGoal={sessionTimeGoal ? {
                ...sessionTimeGoal,
                phaseShares: session.dailyPlan?.timePhaseShares,
                phaseKinds: timePhaseKinds,
              } : null}
              renderCardForDeck={renderCardForDeck}
              renderMiniGameForDeck={renderMiniGameForDeck}
              renderCard={renderCard}
              renderMiniGame={renderMiniGame}
              showNotReady={showNotReady}
              settlingCount={settlingWords.length}
              // The closing card must not claim "nothing due" while the plan's
              // leftovers are still due; it offers them instead. Live, not the
              // plan's own count: words fall due during a session, so the number
              // frozen at planning time can already understate what is waiting —
              // and it has to agree with the Upcoming panel, which counts live.
              dueNowCount={continueAnyway ? 0 : dueNowCount}
              newNowCount={continueAnyway ? 0 : newNowCount}
              onStudyExtra={startBonusRound}
              onPractice={quickPractice.available ? quickPractice.start : undefined}
              practiceSize={quickPractice.size}
              // The day's own plan, not the rail's: during a bonus round the
              // rails follow the bonus, while the card that closes the deck is
              // still reporting the day.
              dayFlow={sessionFlow}
              dayScore={dayScore}
              shortfall={effectiveSessionShortfall}
              extra={extra}
              streak={streak}
              onToggleShowNotReady={() => setShowNotReady(!showNotReady)}
            />
          </>
        )}
      </I18nProvider>
    </AppStateProvider>
  );
}
