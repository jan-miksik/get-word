'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Word } from '@/data/words';
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
} from '@/lib/words';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';
import { LearningLanguageOnboarding } from '@/components/LearningLanguageOnboarding';

export default function Home() {
  const [loaderDismissed, setLoaderDismissed] = useState(false);
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
    memoryHookDisableFromStage,
    markKnown,
    markReallyKnown,
    markUnknown,
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
  } = appState;

  // Use synced words (from word_list_items) when available, fall back to static
  const activeWords = syncedWords ?? normalizedWords;

  const isAuthenticated = isConnected;
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

  return (
    <AppStateProvider value={appState}>
      <I18nProvider language={appState.settingsLanguage}>
        {!loaderDismissed ? (
          <LoadingScreen
            ready={appReady}
          />
        ) : !isAuthenticated ? (
          <AuthRequiredCard onSignIn={signIn} />
        ) : !onboardingCompletedAt || !learningLanguageFrom || !learningLanguageTo ? (
          <LearningLanguageOnboarding
            initialFrom={learningLanguageFrom}
            initialTo={learningLanguageTo}
            onComplete={setLearningLanguages}
            onSelectList={setActiveListId}
          />
        ) : (
          <LearningStudyContent
            viewMode={viewMode}
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
