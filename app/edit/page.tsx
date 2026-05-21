'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Word } from '@/data/words';
import { EditHeader } from '@/features/edit/components/EditHeader';
import { EditStudyContent } from '@/features/edit/components/EditStudyContent';
import { useEditPageState } from '@/features/edit/hooks/useEditPageState';
import { useEditRenderers } from '@/features/edit/hooks/useEditRenderers';
import { useEditableWords } from '@/features/edit/hooks/useEditableWords';
import { useMinigameFrequencyPreference } from '@/features/learning/hooks/useMinigameFrequencyPreference';
import { usePressHandlers } from '@/features/learning/hooks/usePressHandlers';
import { useWordsLoader } from '@/features/learning/hooks/useWordsLoader';
import {
  normalizeWords,
  getAllCategoriesWithCounts,
  shouldShowMemoryHookForStage,
} from '@/lib/words';
import { useAppState } from '@/hooks/useAppState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { EDIT_ONLY_CATEGORIES } from '@/components/EditableWordCard';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';

export default function EditPage() {
  const router = useRouter();
  const { isConnected, email, address: walletAddress, signOut } = useAuth();
  const { words, setWords, isLoading } = useWordsLoader();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const normalizedWords = useMemo(
    () => (words.length > 0 ? normalizeWords(words as Word[]) : []),
    [words]
  );

  const appState = useAppState(normalizedWords);
  const {
    role,
    getWordDisplayMode,
    showAll,
    progress,
    selectedCategories,
    showEnglish,
    showCategoryBadges,
    memoryHooksEnabled,
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
    userWalletAddress,
    userEmail,
    userRole,
    isHydrated,
  } = appState;

  const isAuthenticated = Boolean(appState.userId || isConnected);
  const displayEmail = email ?? userEmail ?? undefined;
  const displayAddress = walletAddress ?? userWalletAddress ?? undefined;

  // Client-side guard: redirect non-editors
  useEffect(() => {
    if (!isHydrated) return;
    if (userRole !== 'editor') {
      setIsRedirecting(true);
      router.replace('/');
    }
  }, [isHydrated, userRole, router]);

  // In edit mode, always show all categories with counts from all words
  const categories = useMemo(() => {
    return getAllCategoriesWithCounts(normalizedWords, normalizedWords, EDIT_ONLY_CATEGORIES);
  }, [normalizedWords]);

  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);
  const { minigameFrequency, setMinigameFrequency } = useMinigameFrequencyPreference();
  const {
    handleCategoryAdd,
    handleCategoryRemove,
    handleCategoryToggle,
    handleSave,
    handleWordFieldChange,
    isSaving,
    saveMessage,
  } = useEditableWords({ words, setWords });

  const phrasesCallbackRef = useCallback((node: HTMLElement | null) => {
    phrasesRef.current = node;
    setPhrasesScrollElement(node);
  }, []);

  useDueTimer(progress);

  // Attach press handlers to cover targets
  usePressHandlers(phrasesScrollElement, [selectedCategories, showAll, role, progress]);

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
    readyCount,
    newWords,
    settlingWords,
    streamGroupedWords,
    progressStats,
  } = useEditPageState({
    normalizedWords,
    filteredWords,
    selectedCategories,
    progress,
    isHydrated,
  });

  const { renderEditableCard } = useEditRenderers({
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
    handleWordFieldChange,
    handleCategoryToggle,
    handleCategoryAdd,
    handleCategoryRemove,
    showEnglish,
    showCategoryBadges,
    categoryOrder,
    shouldRenderMemoryHook,
  });

  return (
    <AppStateProvider value={appState}>
      <I18nProvider language={appState.settingsLanguage}>
        {isLoading || !isHydrated ? (
          <LoadingScreen />
        ) : isRedirecting || userRole !== 'editor' ? (
          <div className="app">
            <div className="p-8 text-center">Přesměrování...</div>
          </div>
        ) : (
          <EditStudyContent
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
            header={
              <EditHeader
                isSaving={isSaving}
                saveMessage={saveMessage}
                onCancel={() => router.push('/')}
                onSave={handleSave}
              />
            }
            phrasesCallbackRef={phrasesCallbackRef}
            phrasesScrollElement={phrasesScrollElement}
            filteredWords={filteredWords}
            streamGroupedWords={streamGroupedWords}
            renderEditableCard={renderEditableCard}
            newWordsCount={newWords.length}
            settlingCount={settlingWords.length}
            showNotReady={showNotReady}
            onToggleShowNotReady={() => setShowNotReady(!showNotReady)}
            readyCount={readyCount}
          />
        )}
      </I18nProvider>
    </AppStateProvider>
  );
}
