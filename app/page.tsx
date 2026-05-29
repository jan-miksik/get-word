'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AuthRequiredCard } from '@/features/learning/components/AuthRequiredCard';
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
import { useAuth } from '@/hooks/useAuth';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';
import { LearningLanguageOnboarding } from '@/components/LearningLanguageOnboarding';
import { MemoryHooksIntroCard } from '@/features/learning/components/MemoryHooksIntroCard';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import {
  persistPWAInstallPromptAnswered,
  readPWAInstallPromptAnswered,
} from '@/features/learning/app-state/storage';
import { isMobileDevice, isSmallScreen, isStandalone, type SimulatedPlatform } from '@/lib/pwa-install';

export default function Home() {
  const [loaderDismissed, setLoaderDismissed] = useState(false);
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
    signIn,
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
    setShowAll,
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
    linkWalletError,
    retryLinkWallet,
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

  useEffect(() => {
    if (loaderDismissed || !appReady) return;
    const timeoutId = window.setTimeout(() => setLoaderDismissed(true), 220);
    return () => window.clearTimeout(timeoutId);
  }, [appReady, loaderDismissed]);

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

  const [previewPWAInstallIntro] = useState<{ enabled: boolean; simulated: SimulatedPlatform }>(() => {
    if (typeof window === 'undefined') return { enabled: false, simulated: null };
    const params = new URLSearchParams(window.location.search);
    if (!params.has('previewPWAInstallIntro')) return { enabled: false, simulated: null };
    const raw = (params.get('previewPWAInstallIntro') ?? '').toLowerCase();
    let simulated: SimulatedPlatform = null;
    if (raw === 'ios') simulated = 'ios';
    else if (raw === 'ios-non-safari') simulated = 'ios-non-safari';
    else if (raw === 'android') simulated = 'android';
    return { enabled: true, simulated };
  });

  const [pwaInstallPromptAnswered, setPwaInstallPromptAnswered] = useState(true);
  const [isAppInstalled, setIsAppInstalled] = useState(true);
  const [isOnMobileDevice, setIsOnMobileDevice] = useState(false);
  const [isOnSmallScreen, setIsOnSmallScreen] = useState(false);

  useEffect(() => {
    setPwaInstallPromptAnswered(readPWAInstallPromptAnswered());
    setIsAppInstalled(isStandalone());
    setIsOnMobileDevice(isMobileDevice());
    setIsOnSmallScreen(isSmallScreen());
    const onAppInstalled = () => setIsAppInstalled(true);
    const onResize = () => setIsOnSmallScreen(isSmallScreen());
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const [previewPWADismissed, setPreviewPWADismissed] = useState(false);

  const handleDismissPWAInstallIntro = useCallback(() => {
    persistPWAInstallPromptAnswered(true);
    setPwaInstallPromptAnswered(true);
    setPreviewPWADismissed(true);
  }, []);

  // Visible only on real mobile (normal flow) or on small viewports (preview/testing).
  const isPWAVisibleForViewport = isOnMobileDevice || isOnSmallScreen;

  // Preview mode is gated on small viewport / mobile UA so the install screen
  // never appears on desktop, even with the URL param set.
  const isPreviewPWAActive =
    previewPWAInstallIntro.enabled && isPWAVisibleForViewport && !previewPWADismissed;

  const shouldShowPWAInstallIntro =
    isPreviewPWAActive ||
    (viewMode === 'card' &&
      isOnMobileDevice &&
      !shouldShowMemoryHooksIntro &&
      !pwaInstallPromptAnswered &&
      !isAppInstalled &&
      completedDeckWordCards >= 10);

  const pwaInstallIntroCard = shouldShowPWAInstallIntro ? (
    <PWAInstallIntroCard
      onDismiss={handleDismissPWAInstallIntro}
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
          <AuthRequiredCard
            onSignIn={hasLinkWalletError && walletAddress ? retryLinkWallet : signIn}
            isBusy={isLinkingWallet}
            error={linkWalletError}
          />
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
