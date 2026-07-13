'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { LearningStudyContent } from '@/features/learning/components/LearningStudyContent';
import { useViewModePreference } from '@/features/learning/app-state/useViewModePreference';
import { useMinigameFrequencyPreference } from '@/features/learning/hooks/useMinigameFrequencyPreference';
import { useLearningPageState } from '@/features/learning/hooks/useLearningPageState';
import { usePressHandlers } from '@/features/learning/hooks/usePressHandlers';
import { useLearningRenderers } from '@/features/learning/hooks/useLearningRenderers';
import { useAppState } from '@/hooks/useAppState';
import {
  getAvailableCategories,
  shouldShowMemoryHookForStage,
  STAGES,
  type NormalizedWord,
} from '@/lib/words';
import { LoadingScreen } from '@/components/LoadingScreen';
import { LandingPage } from '@/components/LandingPage';
import { AudioStorageDebugBadge } from '@/components/AudioStorageDebugBadge';
import { setAudioStorageLoggingEnabled } from '@/lib/audio-debug';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/features/auth/client/useAuth';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';
import { AutoLanguageSetup } from '@/features/learning/onboarding/AutoLanguageSetup';
import { LearningLanguageOnboarding } from '@/features/learning/onboarding/LearningLanguageOnboarding';
import {
  readLandingLanguagePair,
  markLandingLanguagePairConsumed,
} from '@/features/learning/onboarding/landingPairStorage';
import { MemoryHooksIntroCard } from '@/features/learning/components/MemoryHooksIntroCard';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import { usePWAInstallIntro } from '@/features/learning/hooks/usePWAInstallIntro';

const BOOT_LOADING_TIMEOUT_MS = 12_000;

// The learning app now runs entirely on synced word_list_items; there is no
// legacy seed word set. Stable identity avoids needless memo recomputes.
const EMPTY_WORDS: NormalizedWord[] = [];

/**
 * The signed-in learning app shell. Rendered by `app/page.tsx` only for
 * visitors with a valid app session; signed-out visitors get the
 * server-rendered `LandingPage` instead. The `isSignedOut` branch below is a
 * defensive fallback for the brief client window after a sign-out.
 */
export function HomeClient() {
  const [loaderDismissed, setLoaderDismissed] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  // Lets an already-onboarded user replay the language-onboarding screen via
  // `?onboarding=1`. Safe to read in a lazy initializer: the first render is
  // always the LoadingScreen on both server and client, so this value never
  // participates in the hydrated tree.
  const [forceOnboarding, setForceOnboarding] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('onboarding') === '1'
  );
  const [completedDeckWordCards, setCompletedDeckWordCards] = useState(0);
  const [memoryHooksIntroDismissedForSession, setMemoryHooksIntroDismissedForSession] = useState(false);
  const [autoSetupFailed, setAutoSetupFailed] = useState(false);
  const [landingLanguagePair] = useState(() =>
    typeof window !== 'undefined' ? readLandingLanguagePair() : null,
  );
  const {
    isConnected,
    isAuthLoading,
    email,
    authProvider,
    address: walletAddress,
    signOut,
  } = useAuth();

  const linkPayload = useMemo(
    () => (walletAddress ? { email: email ?? null, authProvider: authProvider ?? null } : undefined),
    [walletAddress, email, authProvider]
  );

  const appState = useAppState(EMPTY_WORDS, walletAddress, linkPayload);
  const {
    role,
    getWordDisplayMode,
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
    typingModeEnabled,
    typingWriteIn,
    typingAudioPromptEnabled,
    typingPrefillPunctuation,
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
    isHydrated,
    isInitialServerSyncPending,
    isLinkingWallet,
    hasLinkWalletError,
    setGameScore,
    syncedWords,
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
  } = appState;

  // The app runs on synced words (from word_list_items).
  const activeWords = syncedWords ?? EMPTY_WORDS;

  // Swipe-to-answer (frontier feature): right = known, left = forgotten,
  // up = fully known / no repeat. getStageIndex feeds the deck's "repeat in X"
  // badges; the deck's own group index is a stream-section index (due/new), not
  // the SRS stage.
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

  const isAuthenticated = Boolean(isConnected && userId && !hasLinkWalletError);
  const isWaitingForLinkedProfile = Boolean(
    isConnected &&
      walletAddress &&
      !userId &&
      (!hasLinkWalletError || isLinkingWallet)
  );
  const appReady =
    isHydrated &&
    !isInitialServerSyncPending &&
    !isAuthLoading &&
    !isLinkingWallet &&
    !isWaitingForLinkedProfile;
  const displayEmail = userEmail ?? email ?? undefined;
  const displayAddress = userWalletAddress ?? walletAddress ?? undefined;

  const { minigameFrequency, setMinigameFrequency } = useMinigameFrequencyPreference();
  const { viewMode } = useViewModePreference();

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

  const {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    dueWords,
    settlingWords,
    streamGroupedWords,
    cardDeckGroups,
    progressStats,
  } = useLearningPageState({
    activeWords,
    filteredWords,
    selectedCategories,
    progress,
    isHydrated,
    viewMode,
    minigameFrequency,
    categoryOrder,
    dueTimerRevision,
    typingModeEnabled,
  });

  const {
    renderCard,
    renderMiniGame,
    renderCardForDeck,
    renderMiniGameForDeck,
  } = useLearningRenderers({
    progress,
    role,
    getWordDisplayMode,
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
    typingModeEnabled,
    typingWriteIn,
    typingAudioPromptEnabled,
    typingPrefillPunctuation,
    dismissedGames,
    setDismissedGames,
    setGameScore,
  });

  // No app session: signed-out visitors see the public landing page (below),
  // which explains the app and routes them to /login. The home page must stay
  // viewable without an account so its purpose is clear before signing in.
  const isSignedOut = !isAuthLoading && !isConnected;

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

  const interstitialCard = memoryHooksIntroCard ?? pwaInstallIntroCard;
  const hasNoSelectedWordList = Boolean(
    onboardingCompletedAt &&
      learningLanguageFrom &&
      learningLanguageTo &&
      subscribedLists.length === 0
  );
  const needsLanguageOnboarding = Boolean(
    forceOnboarding ||
      hasNoSelectedWordList ||
      !onboardingCompletedAt ||
      !learningLanguageFrom ||
      !learningLanguageTo
  );
  const landingPairFrom = landingLanguagePair?.from ?? null;
  const landingPairTo = landingLanguagePair?.to ?? null;
  const hasCompleteLandingPair = Boolean(
    landingPairFrom &&
      landingPairTo &&
      landingPairFrom !== landingPairTo
  );
  const shouldAutoSetupLandingPair = Boolean(
    needsLanguageOnboarding &&
      hasCompleteLandingPair &&
      landingLanguagePair?.wantsOwnList !== true &&
      landingLanguagePair?.consumed !== true &&
      !autoSetupFailed &&
      !forceOnboarding
  );
  const onboardingInitialFrom = learningLanguageFrom ?? landingPairFrom;
  const onboardingInitialTo = learningLanguageTo ?? landingPairTo;

  // The streamlined post-login auto-setup fires only once: as soon as we commit to
  // it, flag the stored pair consumed so a refresh before onboarding finishes falls
  // back to the pre-filled language-onboarding screen instead of silently
  // restarting the multi-minute list generation.
  useEffect(() => {
    if (shouldAutoSetupLandingPair) markLandingLanguagePairConsumed();
  }, [shouldAutoSetupLandingPair]);

  return (
    <AppStateProvider value={appState}>
      <I18nProvider language={appState.settingsLanguage}>
        {isEditor ? <AudioStorageDebugBadge /> : null}
        {isSignedOut ? (
          // Public landing page: explains the app without requiring a login.
          <LandingPage />
        ) : !loaderDismissed ? (
          <LoadingScreen />
        ) : !isAuthenticated ? (
          // Authed-but-still-hydrating → waiting on userId. Hold the loading
          // screen rather than flashing app chrome.
          <LoadingScreen />
        ) : shouldAutoSetupLandingPair && landingPairFrom && landingPairTo ? (
          <AutoLanguageSetup
            initialFrom={landingPairFrom}
            initialTo={landingPairTo}
            onComplete={async (from, to) => {
              await setLearningLanguages(from, to);
            }}
            onSelectList={setActiveListId}
            onFallbackToOnboarding={() => setAutoSetupFailed(true)}
          />
        ) : needsLanguageOnboarding ? (
          <LearningLanguageOnboarding
            initialFrom={onboardingInitialFrom}
            initialTo={onboardingInitialTo}
            accountEmail={displayEmail}
            onSignOut={signOut}
            reason={
              hasNoSelectedWordList ||
              autoSetupFailed ||
              (hasCompleteLandingPair && landingLanguagePair?.wantsOwnList)
                ? 'customList'
                : 'onboarding'
            }
            onComplete={async (from, to) => {
              await setLearningLanguages(from, to);
              if (forceOnboarding) {
                setForceOnboarding(false);
                // Drop the `?onboarding=1` param so a refresh doesn't replay it.
                const url = new URL(window.location.href);
                url.searchParams.delete('onboarding');
                window.history.replaceState(null, '', url.toString());
              }
            }}
            onSelectList={setActiveListId}
          />
        ) : (
          <LearningStudyContent
            // Force card view when previewing the PWA install screen — the
            // interstitial only renders inside the card deck.
            viewMode={isPreviewPWAActive ? 'card' : viewMode}
            minigameFrequency={minigameFrequency}
            onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
            isAuthenticated={isAuthenticated}
            authEmail={displayEmail}
            authAddress={displayAddress}
            onSignOut={signOut}
            categories={categories}
            progressStats={progressStats}
            phrasesCallbackRef={phrasesCallbackRef}
            phrasesScrollElement={phrasesScrollElement}
            filteredWords={filteredWords}
            interstitialCard={interstitialCard}
            onDeckWordCardCompleted={() => setCompletedDeckWordCards((count) => count + 1)}
            deckSwipeActions={deckSwipeActions}
            cardDeckGroups={cardDeckGroups}
            streamGroupedWords={streamGroupedWords}
            renderCardForDeck={renderCardForDeck}
            renderMiniGameForDeck={renderMiniGameForDeck}
            renderCard={renderCard}
            renderMiniGame={renderMiniGame}
            dueWordsCount={dueWords.length}
            showNotReady={showNotReady}
            settlingCount={settlingWords.length}
            onToggleShowNotReady={() => setShowNotReady(!showNotReady)}
          />
        )}
      </I18nProvider>
    </AppStateProvider>
  );
}
