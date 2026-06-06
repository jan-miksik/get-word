'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LearningStudyContent } from '@/features/learning/components/LearningStudyContent';
import { useViewModePreference } from '@/features/learning/app-state/useViewModePreference';
import { useMinigameFrequencyPreference } from '@/features/learning/hooks/useMinigameFrequencyPreference';
import { useLearningPageState } from '@/features/learning/hooks/useLearningPageState';
import { usePressHandlers } from '@/features/learning/hooks/usePressHandlers';
import { useLearningRenderers } from '@/features/learning/hooks/useLearningRenderers';
import { useWordsLoader } from '@/features/learning/hooks/useWordsLoader';
import { useAppState } from '@/hooks/useAppState';
import {
  getAvailableCategories,
  normalizeWords,
  shouldShowMemoryHookForStage,
  type Word,
} from '@/lib/words';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/features/auth/client/useAuth';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';
import { LearningLanguageOnboarding } from '@/features/learning/onboarding/LearningLanguageOnboarding';
import { MemoryHooksIntroCard } from '@/features/learning/components/MemoryHooksIntroCard';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import { usePWAInstallIntro } from '@/features/learning/hooks/usePWAInstallIntro';

const BOOT_LOADING_TIMEOUT_MS = 12_000;

export default function Home() {
  const router = useRouter();
  const [loaderDismissed, setLoaderDismissed] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [completedDeckWordCards, setCompletedDeckWordCards] = useState(0);
  const [memoryHooksIntroDismissedForSession, setMemoryHooksIntroDismissedForSession] = useState(false);
  const { words, isLoading: isLoadingWords } = useWordsLoader();
  const {
    isConnected,
    isAuthLoading,
    email,
    authProvider,
    address: walletAddress,
    signOut,
  } = useAuth();

  const normalizedWords = useMemo(
    () => (words.length > 0 ? normalizeWords(words as Word[]) : []),
    [words]
  );

  const linkPayload = useMemo(
    () => (walletAddress ? { email: email ?? null, authProvider: authProvider ?? null } : undefined),
    [walletAddress, email, authProvider]
  );

  const appState = useAppState(normalizedWords, walletAddress, linkPayload);
  const {
    role,
    getWordDisplayMode,
    showAll,
    progress,
    selectedCategories,
    showEnglish,
    showCategoryBadges,
    showPronunciation,
    memoryHooksEnabled,
    memoryHooksIntroAnswered,
    memoryHookDisableFromStage,
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
  } = appState;

  // Use synced words (from word_list_items) when available, otherwise use the fetched words table.
  const activeWords = syncedWords ?? normalizedWords;

  const isAuthenticated = Boolean(isConnected && userId && !hasLinkWalletError);
  const isWaitingForLinkedProfile = Boolean(
    isConnected &&
      walletAddress &&
      !userId &&
      (!hasLinkWalletError || isLinkingWallet)
  );
  const appReady =
    isHydrated &&
    !isLoadingWords &&
    !isAuthLoading &&
    !isLinkingWallet &&
    !isWaitingForLinkedProfile;
  const displayEmail = userEmail ?? email ?? undefined;
  const displayAddress = userWalletAddress ?? walletAddress ?? undefined;

  const { minigameFrequency, setMinigameFrequency } = useMinigameFrequencyPreference();
  const { viewMode, setViewMode } = useViewModePreference();

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
  useDueTimer(progress);

  // Attach press handlers to cover targets (supports virtualized mounts)
  usePressHandlers(phrasesScrollElement, [selectedCategories, showAll, role]);

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
    dismissedGames,
    setDismissedGames,
    setGameScore,
  });

  // No app session: send signed-out visitors straight to the sign-in form.
  // A soft redirect (vs. an inline form) keeps the round-trip fast and lets the
  // home page re-mount/re-hydrate cleanly as the account once they return.
  const needsLogin = !isAuthLoading && !isConnected;
  useEffect(() => {
    if (needsLogin) router.replace('/login');
  }, [needsLogin, router]);

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

  return (
    <AppStateProvider value={appState}>
      <I18nProvider language={appState.settingsLanguage}>
        {!loaderDismissed ? (
          <LoadingScreen />
        ) : !isAuthenticated ? (
          // Signed out → redirecting to /login (see needsLogin effect above);
          // authed-but-still-hydrating → waiting on userId. Either way, hold the
          // loading screen rather than flashing app chrome.
          <LoadingScreen />
        ) : !onboardingCompletedAt || !learningLanguageFrom || !learningLanguageTo ? (
          <LearningLanguageOnboarding
            initialFrom={learningLanguageFrom}
            initialTo={learningLanguageTo}
            onComplete={setLearningLanguages}
            onSelectList={setActiveListId}
          />
        ) : (
          <LearningStudyContent
            // Force card view when previewing the PWA install screen — the
            // interstitial only renders inside the card deck.
            viewMode={isPreviewPWAActive ? 'card' : viewMode}
            onViewModeChange={setViewMode}
            minigameFrequency={minigameFrequency}
            onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
            isAuthenticated={isAuthenticated}
            authEmail={displayEmail}
            authAddress={displayAddress}
            onSignOut={async () => {
              await signOut();
              window.location.assign('/');
            }}
            categories={categories}
            progressStats={progressStats}
            phrasesCallbackRef={phrasesCallbackRef}
            phrasesScrollElement={phrasesScrollElement}
            filteredWords={filteredWords}
            interstitialCard={interstitialCard}
            onDeckWordCardCompleted={() => setCompletedDeckWordCards((count) => count + 1)}
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
