'use client';

import { useCallback, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { I18nProvider } from '@/components/I18nProvider';
import { WordCard } from '@/components/WordCard';
import { AppStateProvider, type AppStateContextValue } from '@/context/AppStateContext';
import { TypingStudyCard } from '@/features/learning/components/TypingStudyCard';
import type { TypingWriteIn } from '@/features/learning/state/preferences';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { ProgressData } from '@/lib/sync';
import type { MinigameFrequencyRange } from '@/lib/minigames';
import {
  DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  STAGES,
  getAvailableCategories,
  isDue,
  matchesCategoryFilter,
  type NormalizedWord,
} from '@/lib/words';
import { calculateProgressStats } from '@/lib/progress-stats';

const PREVIEW_LISTS = [
  { id: 'preview-basics', name: 'Základní slova', languageFrom: 'cs', languageTo: 'vi' },
  { id: 'preview-travel', name: 'Cestování', languageFrom: 'cs', languageTo: 'vi' },
];

const PREVIEW_WORDS: NormalizedWord[] = [
  {
    id: 'preview-dog',
    listId: 'preview-basics',
    category: ['zvířata', 'word'],
    categoryPositions: { zvířata: 0 },
    listPosition: 0,
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: 'pes',
    en: 'dog',
    vi: 'con chó',
    viPron: 'kon čo',
    czHint: 'Pes čeká před domem.',
  },
  {
    id: 'preview-food',
    listId: 'preview-basics',
    category: ['jídlo', 'word'],
    categoryPositions: { jídlo: 1 },
    listPosition: 1,
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: 'jíst',
    en: 'to eat',
    vi: 'ăn',
    viPron: 'an',
    czHint: 'Ano, dám si něco k jídlu.',
  },
  {
    id: 'preview-thanks',
    listId: 'preview-basics',
    category: ['konverzace', 'phrase'],
    categoryPositions: { konverzace: 2 },
    listPosition: 2,
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: 'děkuji',
    en: 'thank you',
    vi: 'cảm ơn',
    viPron: 'kam on',
  },
  {
    id: 'preview-station',
    listId: 'preview-travel',
    category: ['doprava', 'word'],
    categoryPositions: { doprava: 0 },
    listPosition: 0,
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: 'nádraží',
    en: 'station',
    vi: 'nhà ga',
    viPron: 'ňa ga',
  },
  {
    id: 'preview-ticket',
    listId: 'preview-travel',
    category: ['doprava', 'word'],
    categoryPositions: { doprava: 0 },
    listPosition: 1,
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: 'jízdenka',
    en: 'ticket',
    vi: 'vé',
    viPron: 'vé',
  },
];

function createPreviewProgress(): Record<string, ProgressData> {
  const now = Date.now();
  return {
    'preview-dog': {
      stageIndex: 2,
      knownCount: 3,
      unknownCount: 1,
      nextDueAt: now - 60_000,
    },
    'preview-food': {
      stageIndex: 1,
      knownCount: 1,
      unknownCount: 0,
      nextDueAt: now + STAGES[1].intervalMs,
    },
    'preview-thanks': { stageIndex: 0, knownCount: 0, unknownCount: 0 },
    'preview-station': {
      stageIndex: 3,
      knownCount: 4,
      unknownCount: 1,
      nextDueAt: now - 120_000,
    },
    'preview-ticket': { stageIndex: 0, knownCount: 0, unknownCount: 0 },
  };
}

function getListWords(listId: string): NormalizedWord[] {
  return PREVIEW_WORDS.filter((word) => word.listId === listId);
}

function getInitialCategorySelection(listId: string): Set<string> {
  return new Set(getAvailableCategories(getListWords(listId)).map((category) => category.name));
}

export function PreviewLearningPage() {
  const [settingsLanguage, setSettingsLanguage] = useState('cs');

  return (
    <I18nProvider language={settingsLanguage}>
      <PreviewStudy settingsLanguage={settingsLanguage} onSettingsLanguageChange={setSettingsLanguage} />
    </I18nProvider>
  );
}

function PreviewStudy({
  settingsLanguage,
  onSettingsLanguageChange,
}: {
  settingsLanguage: string;
  onSettingsLanguageChange: (language: string) => void;
}) {
  const [activeListId, setActiveListId] = useState(PREVIEW_LISTS[0].id);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => getInitialCategorySelection(PREVIEW_LISTS[0].id),
  );
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressData>>(createPreviewProgress);
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({
    'preview-dog': 'Con chó hlídá dům.',
  });
  const [role, setRole] = useState<LearningRole>('knownLanguage');
  const [memoryHooksEnabled, setMemoryHooksEnabled] = useState(true);
  const [memoryHookDisableFromStage, setMemoryHookDisableFromStage] = useState<number>(
    DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  );
  const [showAll, setShowAll] = useState(false);
  const [typingModeEnabled, setTypingModeEnabled] = useState(false);
  const [typingWriteIn, setTypingWriteIn] = useState<TypingWriteIn>('foreign');
  const [typingAudioPromptEnabled, setTypingAudioPromptEnabled] = useState(false);
  const [typingPrefillPunctuation, setTypingPrefillPunctuation] = useState(false);
  const [typingMobileKeyboardAutoFocus, setTypingMobileKeyboardAutoFocus] = useState(false);
  // Remounts the typing card after each answer so the preview can be exercised
  // repeatedly (the real app advances the stream instead).
  const [typingRound, setTypingRound] = useState(0);
  const [gameScore, setGameScore] = useState(12);
  const [minigameFrequency, setMinigameFrequency] = useState<MinigameFrequencyRange>({
    min: 2,
    max: 3,
  });

  const activeWords = useMemo(() => getListWords(activeListId), [activeListId]);
  const categories = useMemo(() => getAvailableCategories(activeWords), [activeWords]);
  const filteredWords = useMemo(
    () => activeWords.filter((word) => matchesCategoryFilter(word, selectedCategories)),
    [activeWords, selectedCategories],
  );
  const currentWord = filteredWords[0] ?? null;
  const readyCount = filteredWords.filter((word) => isDue(progress[word.id])).length;
  const progressStats = useMemo(
    () => calculateProgressStats(filteredWords, progress, readyCount),
    [filteredWords, progress, readyCount],
  );
  const activeList = PREVIEW_LISTS.find((list) => list.id === activeListId) ?? PREVIEW_LISTS[0];

  const chooseList = useCallback((id: string | null) => {
    const nextId = id ?? PREVIEW_LISTS[0].id;
    setActiveListId(nextId);
    setCategoryOrder([]);
    setSelectedCategories(getInitialCategorySelection(nextId));
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const changeProgress = useCallback(
    (wordId: string, action: 'known' | 'unknown' | { stageIndex: number; noRepeat?: boolean }) => {
      setProgress((current) => {
        const entry = current[wordId] ?? { stageIndex: 0, knownCount: 0, unknownCount: 0 };
        const now = Date.now();
        const stageIndex = typeof action === 'object'
          ? Math.max(0, Math.min(action.stageIndex, STAGES.length - 1))
          : action === 'known'
            ? Math.min(entry.stageIndex + 1, STAGES.length - 1)
            : Math.max(entry.stageIndex - 1, 0);
        const interval = STAGES[stageIndex].intervalMs;
        return {
          ...current,
          [wordId]: {
            ...entry,
            stageIndex,
            knownCount: action === 'known' ? entry.knownCount + 1 : entry.knownCount,
            unknownCount: action === 'unknown' ? entry.unknownCount + 1 : entry.unknownCount,
            lastKnownAt: action === 'known' ? now : entry.lastKnownAt,
            lastUnknownAt: action === 'unknown' ? now : entry.lastUnknownAt,
            nextDueAt:
              typeof action === 'object' && action.noRepeat
                ? undefined
                : interval > 0
                  ? now + interval
                  : undefined,
          },
        };
      });
    },
    [],
  );

  const setMemoryHook = useCallback((word: Pick<NormalizedWord, 'id'>, hook: string) => {
    setMemoryHooks((current) => ({ ...current, [word.id]: hook.trim() }));
  }, []);

  // This adapter supplies only local UI state: no useAppState hook means no hydration,
  // outbox, API mutation, or account/session work occurs on the preview route.
  const previewState = {
    role,
    setRole,
    showAll,
    setShowAll,
    showEnglish: false,
    showCategoryBadges: false,
    showPronunciation: true,
    memoryHooksEnabled,
    setMemoryHooksEnabled,
    memoryHooksIntroAnswered: true,
    setMemoryHooksIntroAnswered: () => undefined,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    typingModeEnabled,
    setTypingModeEnabled,
    typingWriteIn,
    setTypingWriteIn,
    typingAudioPromptEnabled,
    setTypingAudioPromptEnabled,
    typingPrefillPunctuation,
    setTypingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    setTypingMobileKeyboardAutoFocus,
    settingsLanguage,
    settingsLanguageSelectedAt: null,
    setSettingsLanguage: onSettingsLanguageChange,
    learningLanguageFrom: 'cs',
    learningLanguageTo: 'vi',
    onboardingCompletedAt: 'preview',
    setLearningLanguages: async () => undefined,
    categoryOrder,
    setCategoryOrder,
    selectedCategories,
    toggleCategory,
    filteredWords,
    applyServerCategories: () => undefined,
    progress,
    lastMovedId: null,
    markKnown: (wordId: string) => changeProgress(wordId, 'known'),
    markReallyKnown: (wordId: string) => changeProgress(wordId, { stageIndex: STAGES.length - 1 }),
    markUnknown: (wordId: string) => changeProgress(wordId, 'unknown'),
    setCustomStage: (wordId: string, stageIndex: number, opts?: { noRepeat?: boolean }) =>
      changeProgress(wordId, { stageIndex, noRepeat: opts?.noRepeat }),
    getWordDisplayMode: () => 0 as const,
    memoryHooks,
    getMemoryHook: (word: Pick<NormalizedWord, 'id'>) => memoryHooks[word.id] ?? '',
    setMemoryHook,
    getSuggestedMemoryHook: (word: NormalizedWord) => word.czHint ?? '',
    gameScore,
    setGameScore,
    userId: 'preview-user',
    userWalletAddress: null,
    userEmail: 'preview@get-word.local',
    userRole: 'user' as const,
    isEditor: false,
    isHydrated: true,
    isLinkingWallet: false,
    hasLinkWalletError: false,
    syncedWords: activeWords,
    subscribedLists: PREVIEW_LISTS,
    activeList,
    activeListId,
    setActiveListId: chooseList,
  } as unknown as AppStateContextValue;

  return (
    <AppStateProvider value={previewState}>
      <AppLayout
        viewMode="card"
        minigameFrequency={minigameFrequency}
        onMinigameFrequencyChange={setMinigameFrequency}
        isAuthenticated
        authEmail="preview@get-word.local"
        accountSlotOverride={
          <div className="auth-button is-connected pointer-events-none" aria-label="Preview account">
            <span className="auth-dot" />
            <span className="auth-label">preview@get-word.local</span>
          </div>
        }
        categories={categories}
        progressStats={progressStats}
      >
        <main className="learning-card-main flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden" aria-live="polite">
          <div className="learning-card-viewport relative flex h-full w-full flex-col max-w-[800px] mx-auto">
            {currentWord && typingModeEnabled ? (
              <div className="h-full flex flex-col justify-end md:justify-start relative">
                <TypingStudyCard
                  key={`typing-${currentWord.id}-${typingRound}`}
                  word={currentWord}
                  progress={progress[currentWord.id]}
                  role={role}
                  writeIn={typingWriteIn}
                  audioPromptEnabled={false}
                  prefillPunctuation={typingPrefillPunctuation}
                  modeIndex={(typingRound % 2) as 0 | 1}
                  onScore={(points) => setGameScore((score) => Math.max(0, score + points))}
                  onOutcome={(outcome) => {
                    if (outcome === 'known') changeProgress(currentWord.id, 'known');
                    else if (outcome === 'unknown') changeProgress(currentWord.id, 'unknown');
                    else
                      changeProgress(currentWord.id, {
                        stageIndex: progress[currentWord.id]?.stageIndex ?? 0,
                      });
                    setTypingRound((round) => round + 1);
                  }}
                  onCustomStage={(stageIndex, opts) => {
                    changeProgress(currentWord.id, { stageIndex, noRepeat: opts?.noRepeat });
                    setTypingRound((round) => round + 1);
                  }}
                  memoryHook={memoryHooks[currentWord.id] ?? ''}
                  suggestedHook={currentWord.czHint ?? ''}
                  onMemoryHookChange={(hook) => setMemoryHook(currentWord, hook)}
                  showMemoryHook={memoryHooksEnabled && progress[currentWord.id].stageIndex < memoryHookDisableFromStage}
                  fullscreen
                  autoFocusOnMobile={typingMobileKeyboardAutoFocus}
                />
              </div>
            ) : currentWord ? (
              <div className="h-full flex flex-col justify-end md:justify-start relative">
                <WordCard
                  word={currentWord}
                  progress={progress[currentWord.id]}
                  role={role}
                  modeIndex={0}
                  showAll={showAll}
                  memoryHook={memoryHooks[currentWord.id] ?? ''}
                  suggestedHook={currentWord.czHint ?? ''}
                  onKnown={() => changeProgress(currentWord.id, 'known')}
                  onCustomStage={(stageIndex, opts) =>
                    changeProgress(currentWord.id, { stageIndex, noRepeat: opts?.noRepeat })
                  }
                  onUnknown={() => changeProgress(currentWord.id, 'unknown')}
                  onMemoryHookChange={(hook) => setMemoryHook(currentWord, hook)}
                  showEnglish={false}
                  showCategoryBadges={false}
                  showPronunciation
                  categoryOrder={categoryOrder}
                  showMemoryHook={memoryHooksEnabled && progress[currentWord.id].stageIndex < memoryHookDisableFromStage}
                  fullscreen
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[#2A2218]">
                Ve vybraných kategoriích nejsou žádná slova.
              </div>
            )}
          </div>
        </main>
      </AppLayout>
    </AppStateProvider>
  );
}
