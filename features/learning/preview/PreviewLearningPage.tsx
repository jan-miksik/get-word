'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { I18nProvider } from '@/components/I18nProvider';
import { AppStateProvider, type AppStateContextValue } from '@/context/AppStateContext';
import { StudyExerciseCard } from '@/features/learning/components/StudyExerciseCard';
import { useExerciseResolver } from '@/features/learning/hooks/useExerciseResolver';
import { FeatureTour } from '@/features/learning/onboarding/FeatureTour';
import { DEFAULT_FINE_TUNE_CONFIG } from '@/features/learning/fine-tune/config';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { ProgressData } from '@/features/sync/contracts';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import { BubbleChoiceGame } from '@/features/learning/components/games/BubbleChoiceGame';
import { MultipleChoiceGame } from '@/features/learning/components/games/MultipleChoiceGame';
import { SessionRail } from '@/features/learning/components/SessionRail';
import { SessionBreatherCard } from '@/features/learning/components/SessionBreatherCard';
import { SessionDoneCard } from '@/features/learning/components/SessionDoneCard';
import { QuickPracticeRun } from '@/features/learning/quick-practice/QuickPracticeRun';
import { useQuickPractice } from '@/features/learning/quick-practice/useQuickPractice';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';
import type { StreakChipData } from '@/features/learning/goals/streakWeek';
import {
  DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  STAGES,
  getAvailableCategories,
  isDue,
  matchesCategoryFilter,
  type NormalizedWord,
} from '@/lib/words';
import { calculateProgressStats } from '@/lib/progress-stats';

/**
 * The tallest the closing card ever gets: a closed day with both streaks, the
 * week, an over-goal chip and two offers. Height problems only show up in this
 * state, so the preview keeps one around rather than making them reproducible
 * by luck.
 */
const PREVIEW_STREAK: StreakChipData = {
  days: [
    { dayKey: '2026-08-24', weekday: 1, status: 'exceeded', preferred: true, isToday: false, isFuture: false },
    { dayKey: '2026-08-25', weekday: 2, status: 'met', preferred: true, isToday: false, isFuture: false },
    { dayKey: '2026-08-26', weekday: 3, status: 'partial', preferred: false, isToday: false, isFuture: false },
    { dayKey: '2026-08-27', weekday: 4, status: 'met', preferred: true, isToday: true, isFuture: false },
    { dayKey: '2026-08-28', weekday: 5, status: 'none', preferred: true, isToday: false, isFuture: true },
    { dayKey: '2026-08-29', weekday: 6, status: 'none', preferred: false, isToday: false, isFuture: true },
    { dayKey: '2026-08-30', weekday: 7, status: 'none', preferred: false, isToday: false, isFuture: true },
  ],
  weeks: [],
  dailyStreak: 4,
  weeklyStreak: 3,
  keptThisWeek: 3,
  weekTarget: 4,
};

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
  return new Set(getAvailableCategories(getListWords(listId)).map((category) => category.key));
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
  const [typingPrefillPunctuation, setTypingPrefillPunctuation] = useState(false);
  const [typingMobileKeyboardAutoFocus, setTypingMobileKeyboardAutoFocus] = useState(false);
  const [typingPlayAudioAfterCheck, setTypingPlayAudioAfterCheck] = useState(false);
  const [typingCheckButtonEnabled, setTypingCheckButtonEnabled] = useState(false);
  // Remounts the typing card after each answer so the preview can be exercised
  // repeatedly (the real app advances the stream instead).
  const [fineTuneConfig, setFineTuneConfig] = useState(DEFAULT_FINE_TUNE_CONFIG);
  const [typingRound, setTypingRound] = useState(0);
  const [gameScore, setGameScore] = useState(12);
  // `?previewFeatureTour` also works on the real study page; here it needs no
  // session or study history, which is what makes it useful for design review.
  const [showFeatureTour, setShowFeatureTour] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('previewFeatureTour'),
  );
  const [minigameFrequency, setMinigameFrequency] = useState<MinigameFrequencyRange>({
    min: 2,
    max: 3,
  });

  // Dev-only harness switches render surfaces that are otherwise only
  // reachable mid-session in the real app, which makes them hard to iterate on
  // visually. `session-done` mirrors a completed goal with optional reviews,
  // and `session-short` the day that ran out of words before reaching it.
  const previewSurface = useSearchParams().get('preview');
  // Which seam the breather preview sits at. The card is only ever seen with
  // the blocks behind it finished, so the step walks the seams rather than the
  // answers: continuing moves to the next one and the day track redraws.
  const [breatherStep, setBreatherStep] = useState(0);
  const previewBlocks = useMemo<SessionBlockProgress[]>(
    () =>
      ([
        { key: 'review-0', kind: 'review', total: 6, done: 0, pending: 0, liveRemaining: 6, unavailable: 0 },
        { key: 'new-0', kind: 'new', total: 4, done: 0, pending: 0, liveRemaining: 4, unavailable: 0 },
        { key: 'review-1', kind: 'review', total: 12, done: 0, pending: 0, liveRemaining: 12, unavailable: 0 },
      ] satisfies SessionBlockProgress[]).map((block, index) =>
        index <= breatherStep ? { ...block, done: block.total, liveRemaining: 0 } : block,
      ),
    [breatherStep],
  );
  const previewFlow = useMemo(() => resolveSessionFlow(previewBlocks), [previewBlocks]);
  const quickPractice = useQuickPractice({ words: PREVIEW_WORDS });

  const activeWords = useMemo(() => getListWords(activeListId), [activeListId]);
  // The preview drives the real dispatcher, so it exercises the same per-stage
  // method selection the app uses rather than a parallel code path.
  const resolveExercise = useExerciseResolver(fineTuneConfig, activeWords, role);
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
    learningFineTune: fineTuneConfig,
    setLearningFineTune: setFineTuneConfig,
    typingPrefillPunctuation,
    setTypingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    setTypingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    setTypingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    setTypingCheckButtonEnabled,
    // Chrome the preview is there to show; the real page reads these from the
    // learner's local preferences.
    photoLabEnabled: true,
    quickAddEnabled: true,
    setQuickAddEnabled: () => undefined,
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
    syncedWords: activeWords,
    subscribedLists: PREVIEW_LISTS,
    activeList,
    activeListId,
    setActiveListId: chooseList,
  } as unknown as AppStateContextValue;

  return (
    <AppStateProvider value={previewState}>
      {showFeatureTour && <FeatureTour onFinish={() => setShowFeatureTour(false)} />}
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
            <SessionRail flow={previewFlow} />
            {previewSurface === 'session-short' ? (
              <div className="flex h-full justify-center overflow-y-auto">
                <SessionDoneCard
                  settlingCount={0}
                  dayFlow={resolveSessionFlow([
                    { ...previewBlocks[0], done: 4, total: 4, liveRemaining: 0 },
                  ])}
                  shortfall={6}
                  onOpenWordChat={() => undefined}
                />
              </div>
            ) : previewSurface === 'session-done' ? (
              <div className="flex h-full justify-center overflow-y-auto">
                <SessionDoneCard
                  settlingCount={7}
                  dueNowCount={39}
                  newNowCount={6}
                  dayFlow={resolveSessionFlow([
                    { ...previewBlocks[0], done: 6, liveRemaining: 0 },
                    { ...previewBlocks[1], done: 4, liveRemaining: 0 },
                  ])}
                  // Regression harness: this visit exhausted a smaller frozen
                  // remainder, but the whole day was already earned and went
                  // 13 cards over its 20-card resolved target.
                  dayScore={{ introduced: 13, reviewed: 20, target: 20, met: true }}
                  shortfall={12}
                  streak={PREVIEW_STREAK}
                  onStudyExtra={() => undefined}
                  onOpenWordChat={() => undefined}
                />
              </div>
            ) : previewSurface === 'session-clear' ? (
              <div className="flex h-full justify-center overflow-y-auto">
                {quickPractice.rounds ? (
                  <QuickPracticeRun
                    rounds={quickPractice.rounds}
                    role="knownLanguage"
                    onFinish={quickPractice.finish}
                  />
                ) : (
                  <SessionDoneCard
                    settlingCount={7}
                    dayFlow={resolveSessionFlow([
                      { ...previewBlocks[0], done: 6, liveRemaining: 0 },
                      { ...previewBlocks[1], done: 4, liveRemaining: 0 },
                    ])}
                    dayScore={{ introduced: 14, reviewed: 6, target: 15 }}
                    onPractice={quickPractice.available ? quickPractice.start : undefined}
                    practiceSize={quickPractice.size}
                    onOpenWordChat={() => undefined}
                  />
                )}
              </div>
            ) : previewSurface === 'session' ? (
              <div className="relative h-full">
                <SessionBreatherCard
                  breather={{
                    finished: previewBlocks[breatherStep],
                    next: previewBlocks[breatherStep + 1],
                    flow: previewFlow,
                    words: PREVIEW_WORDS.slice(0, previewBlocks[breatherStep].total),
                  }}
                  role={role}
                  onContinue={() => setBreatherStep((step) => (step + 1) % 2)}
                />
              </div>
            ) : previewSurface === 'bubbles' ? (
              <div className="relative mx-[calc(50%-50vw)] h-full w-screen">
                <BubbleChoiceGame
                  words={filteredWords}
                  role={role}
                  level={1}
                  onScore={(points) => setGameScore((score) => Math.max(0, score + points))}
                  onComplete={() => setTypingRound((round) => round + 1)}
                />
              </div>
            ) : previewSurface === 'choice' ? (
              <MultipleChoiceGame
                words={PREVIEW_WORDS}
                role={role}
                level={2}
                stageIndex={4}
                onResult={(points) => setGameScore((score) => Math.max(0, score + points))}
              />
            ) : currentWord ? (
              // Stands in for the card deck's own `data-tour` anchor so the
              // feature tour can be exercised here; see `featureTourSteps.ts`.
              <div data-tour="study" className="h-full flex flex-col justify-end md:justify-start relative">
                <StudyExerciseCard
                  key={`exercise-${currentWord.id}-${typingRound}`}
                  word={currentWord}
                  progress={progress[currentWord.id]}
                  role={role}
                  exercise={resolveExercise(currentWord, progress[currentWord.id])}
                  showAll={showAll}
                  memoryHook={memoryHooks[currentWord.id] ?? ''}
                  suggestedHook={currentWord.czHint ?? ''}
                  onMemoryHookChange={(hook) => setMemoryHook(currentWord, hook)}
                  showMemoryHook={memoryHooksEnabled && progress[currentWord.id].stageIndex < memoryHookDisableFromStage}
                  onKnown={() => changeProgress(currentWord.id, 'known')}
                  onReallyKnown={() => changeProgress(currentWord.id, { stageIndex: STAGES.length - 1 })}
                  onUnknown={() => changeProgress(currentWord.id, 'unknown')}
                  onCustomStage={(stageIndex, opts) => {
                    changeProgress(currentWord.id, { stageIndex, noRepeat: opts?.noRepeat });
                    setTypingRound((round) => round + 1);
                  }}
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
                  showEnglish={false}
                  showCategoryBadges={false}
                  showPronunciation
                  categoryOrder={categoryOrder}
                  studyNotesEnabled={false}
                  studyNoteMinimizeFromStage={2}
                  typingPrefillPunctuation={typingPrefillPunctuation}
                  typingPlayAudioAfterCheck={typingPlayAudioAfterCheck}
                  typingCheckButtonEnabled={typingCheckButtonEnabled}
                  fullscreen
                  autoFocusOnMobile={typingMobileKeyboardAutoFocus}
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
