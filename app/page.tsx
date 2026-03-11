'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Word } from '@/data/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { useWordStream } from '@/hooks/useWordStream';
import { usePressHandlers } from '@/hooks/usePressHandlers';
import { getAvailableCategories, STAGES, NormalizedWord, normalizeWords } from '@/lib/words';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import {
  computeGameAnchors,
  composeStream,
  type MiniGameConfig,
  type GameAnchor,
  type MinigameFrequencyRange,
  DEFAULT_MINIGAME_FREQUENCY,
} from '@/lib/minigames';
import { AppLayout } from '@/components/AppLayout';
import { WordCard } from '@/components/WordCard';
import { MiniGameCard } from '@/components/MiniGameCard';
import { LoadingScreen } from '@/components/LoadingScreen';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { CardDeckView } from '@/components/CardDeckView';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';
import { deleteDeviceId } from '@/lib/device-id';
import { resetSyncIdentity } from '@/lib/sync';
import type { ProgressData } from '@/lib/sync';
import { AppStateProvider } from '@/context/AppStateContext';


export default function Home() {
  const { words, isLoading: isLoadingWords } = useWordsLoader();
  const { isConnected, email, authProvider, address: walletAddress, signOut } = useAuth();
  const didHardResetRef = useRef(false);

  const hardResetToFreshUser = useCallback(() => {
    if (didHardResetRef.current) return;
    didHardResetRef.current = true;
    resetSyncIdentity();
    deleteDeviceId();
    window.location.reload();
  }, []);

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
    markKnown,
    markReallyKnown,
    markUnknown,
    filteredWords,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    isHydrated,
    setGameScore,
  } = appState;

  const isAuthenticated = isConnected;
  const displayEmail = email ?? undefined;
  const displayAddress = walletAddress ?? undefined;

  // If the wallet disconnects via the Reown modal (not our "Sign out" button),
  // still reset to a fresh-user state.
  const wasConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (wasConnectedRef.current && !isConnected) {
      hardResetToFreshUser();
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, hardResetToFreshUser]);

  const [showNotReady, setShowNotReady] = useState(false);
  const [minigameFrequency, setMinigameFrequency] = useState<MinigameFrequencyRange>(
    DEFAULT_MINIGAME_FREQUENCY
  );
  const [viewMode, setViewModeRaw] = useState<'card' | 'stream'>(() => {
    if (typeof window === 'undefined') return 'card';
    return (localStorage.getItem('wordlink-view-mode') as 'card' | 'stream') ?? 'card';
  });
  const setViewMode = (mode: 'card' | 'stream') => {
    setViewModeRaw(mode);
    localStorage.setItem('wordlink-view-mode', mode);
  };
  const [dismissedGames, setDismissedGames] = useState<Set<string>>(new Set());
  const [minigameSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000_000));
  const lockedDeckCardStateRef = useRef<Map<string, { modeIndex: number; progress: ProgressData }>>(
    new Map()
  );

  // originalCombined is the word list captured at the start of each filter session.
  const [originalCombined, setOriginalCombined] = useState<NormalizedWord[]>([]);
  const [originalIndexMap, setOriginalIndexMap] = useState<Map<string, number>>(new Map());
  const lastCategoriesKeyRef = useRef<string | null>(null);
  const latestCombinedRef = useRef<NormalizedWord[]>([]);
  const lockedGameWordsRef = useRef<Map<string, NormalizedWord[]>>(new Map());

  const categories = useMemo(
    () => getAvailableCategories(normalizedWords),
    [normalizedWords]
  );

  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);

  // Load preferred minigame frequency from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('wordlink-minigame-frequency');
    if (!stored) return;
    if (stored === 'off') { setMinigameFrequency('off'); return; }
    const legacy: Record<string, MinigameFrequencyRange> = {
      '2-5': { min: 2, max: 5 },
      '3-7': { min: 3, max: 7 },
      '5-10': { min: 5, max: 10 },
    };
    if (legacy[stored]) { setMinigameFrequency(legacy[stored]); return; }
    try {
      const parsed = JSON.parse(stored) as MinigameFrequencyRange;
      if (parsed === 'off' || (typeof parsed === 'object' && typeof parsed?.min === 'number' && typeof parsed?.max === 'number')) {
        setMinigameFrequency(parsed);
      }
    } catch {
      // ignore invalid JSON
    }
  }, []);

  // Persist minigame frequency preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const toStore = minigameFrequency === 'off' ? 'off' : JSON.stringify(minigameFrequency);
    window.localStorage.setItem('wordlink-minigame-frequency', toStore);
  }, [minigameFrequency]);

  // Callback ref: fires immediately when <main> mounts
  const phrasesCallbackRef = useCallback((node: HTMLElement | null) => {
    phrasesRef.current = node;
    setPhrasesScrollElement(node);
  }, []);

  // Trigger re-render when cards become due for review
  useDueTimer(progress);

  // Attach press handlers to cover targets (supports virtualized mounts)
  usePressHandlers(phrasesRef, [selectedCategories, showAll, role]);

  // Reset expandable sections when filters change
  useEffect(() => {
    setShowNotReady(false);
    setDismissedGames(new Set());
  }, [selectedCategories]);

  const statsWords = useMemo(() => {
    return getProgressStatsWords(normalizedWords, selectedCategories);
  }, [normalizedWords, selectedCategories]);

  // Split filteredWords into due / new / settling
  const { dueWords, newWords, settlingWords } = useWordStream(filteredWords, progress, isHydrated);

  const readyCount = dueWords.length;

  // Words with at least stageIndex 1 — used as the game word pool
  const learnedPool = useMemo(
    () => filteredWords.filter(w => (progress[w.id]?.stageIndex ?? 0) > 0),
    [filteredWords, progress]
  );

  // Active learning stream: due words first, then new words
  const combined = useMemo(() => [...dueWords, ...newWords], [dueWords, newWords]);

  latestCombinedRef.current = combined;

  // Snapshot the combined list once per filter session
  const currentCategoriesKey = [...selectedCategories].sort().join(',');
  const hasWords = combined.length > 0;
  useEffect(() => {
    if (!isHydrated || !hasWords) return;
    if (currentCategoriesKey === lastCategoriesKeyRef.current && originalCombined.length > 0) return;

    lastCategoriesKeyRef.current = currentCategoriesKey;
    lockedGameWordsRef.current = new Map();
    const snapshot = [...latestCombinedRef.current];
    setOriginalCombined(snapshot);
    setOriginalIndexMap(new Map(snapshot.map((w, i) => [w.id, i])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, hasWords, currentCategoriesKey]);

  // Compute stable game anchors from the snapshot
  const gameAnchors = useMemo((): GameAnchor[] => {
    if (minigameFrequency === 'off' || originalCombined.length === 0) return [];
    const { min, max } = minigameFrequency;
    const rawAnchors = computeGameAnchors(originalCombined, learnedPool, minigameSeed, {
      minInterval: min,
      maxInterval: max,
    });
    return rawAnchors.map(anchor => {
      if (!lockedGameWordsRef.current.has(anchor.id)) {
        lockedGameWordsRef.current.set(anchor.id, anchor.words);
      }
      return { ...anchor, words: lockedGameWordsRef.current.get(anchor.id)! };
    });
  }, [originalCombined, learnedPool, minigameSeed, minigameFrequency]);

  // Build groupedWords for VirtualizedWordList
  const streamGroupedWords = useMemo(() => {
    const groups: (NormalizedWord | MiniGameConfig)[][] = STAGES.map(() => []);
    if (!isHydrated) return groups;

    let wordStream: (NormalizedWord | MiniGameConfig)[];
    if (minigameFrequency === 'off' || gameAnchors.length === 0) {
      wordStream = combined;
    } else {
      wordStream = composeStream(combined, originalIndexMap, gameAnchors);
    }
    if (dismissedGames.size > 0) {
      wordStream = wordStream.filter(
        (item) => !('_isMinigame' in item) || !dismissedGames.has(item.id)
      );
    }

    const dueCount = dueWords.length;
    let wordsSeen = 0;
    wordStream.forEach(item => {
      if (!('_isMinigame' in item)) wordsSeen++;
      if (wordsSeen <= dueCount) {
        groups[0].push(item);
      } else {
        groups[1].push(item);
      }
    });

    if (showNotReady) {
      settlingWords.forEach((word) => {
        const sIdx = Math.max(2, Math.min(progress[word.id]?.stageIndex ?? 2, STAGES.length - 1));
        groups[sIdx].push(word);
      });
    }
    return groups;
  }, [combined, dueWords.length, settlingWords, showNotReady, progress, isHydrated, gameAnchors, originalIndexMap, minigameFrequency, dismissedGames]);

  // Memoized card renderer — must be before early return
  const renderCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
    return (
      <div key={word.id} className="pt-8">
        <WordCard
          word={word}
          progress={prog}
          role={role}
          modeIndex={getWordDisplayMode(word.id)}
          showAll={showAll}
          memoryHook={getMemoryHook(word.id)}
          suggestedHook={getSuggestedMemoryHook(word)}
          onKnown={() => markKnown(word.id)}
          onReallyKnown={() => markReallyKnown(word.id)}
          onUnknown={() => markUnknown(word.id)}
          onMemoryHookChange={(hook) => setMemoryHook(word.id, hook)}
          isMoved={lastMovedId === word.id}
          showEnglish={showEnglish}
          showCategoryBadges={showCategoryBadges}
        />
      </div>
    );
  }, [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges]);

  const renderMiniGame = useCallback((config: MiniGameConfig) => {
    if (dismissedGames.has(config.id)) return null;
    return (
      <div key={config.id} className="pt-8 h-full min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          <MiniGameCard
            config={config}
            role={role}
            onDismiss={() => setDismissedGames(prev => new Set([...prev, config.id]))}
            onResult={(won) => setGameScore(prev => Math.max(0, prev + (won ? 1 : -1)))}
          />
        </div>
      </div>
    );
  }, [dismissedGames, role]);

  const renderCardForDeck = useCallback(
    (
      word: NormalizedWord,
      _stageIndex: number,
      onComplete: () => void,
      opts?: { isExiting: boolean }
    ) => {
      const liveProg = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      const liveModeIndex = getWordDisplayMode(word.id);
      const isExiting = opts?.isExiting ?? false;
      const locked = lockedDeckCardStateRef.current.get(word.id);
      if (isExiting) {
        if (!locked) {
          lockedDeckCardStateRef.current.set(word.id, {
            modeIndex: liveModeIndex,
            progress: liveProg,
          });
        }
      } else if (locked) {
        lockedDeckCardStateRef.current.delete(word.id);
      }
      const cardState = isExiting
        ? lockedDeckCardStateRef.current.get(word.id)
        : null;
      const prog = cardState?.progress ?? liveProg;
      const modeIndex = cardState?.modeIndex ?? liveModeIndex;
      return (
        <div key={word.id} className="h-full flex flex-col justify-end md:justify-start relative">
          <WordCard
            word={word}
            progress={prog}
            role={role}
            modeIndex={modeIndex}
            showAll={showAll}
            memoryHook={getMemoryHook(word.id)}
            suggestedHook={getSuggestedMemoryHook(word)}
            onKnown={() => { onComplete(() => markKnown(word.id)); }}
            onReallyKnown={() => { onComplete(() => markReallyKnown(word.id)); }}
            onUnknown={() => { onComplete(() => markUnknown(word.id)); }}
            onMemoryHookChange={(hook) => setMemoryHook(word.id, hook)}
            isMoved={false}
            showEnglish={showEnglish}
            showCategoryBadges={showCategoryBadges}
            fullscreen
          />
        </div>
      );
    },
    [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, showEnglish, showCategoryBadges]
  );

  const renderMiniGameForDeck = useCallback(
    (config: MiniGameConfig, onComplete: () => void) => (
      <div key={config.id} className="h-full">
        <MiniGameCard
          config={config}
          role={role}
          onDismiss={() => {
            setDismissedGames(prev => new Set([...prev, config.id]));
            onComplete();
          }}
          onResult={(won) => {
            setGameScore(prev => Math.max(0, prev + (won ? 1 : -1)));
          }}
        />
      </div>
    ),
    [dismissedGames, role, setGameScore]
  );

  const progressStats = useMemo(
    () => calculateProgressStats(statsWords, progress, readyCount),
    [statsWords, progress, readyCount]
  );

  if (!isHydrated || isLoadingWords) {
    return <LoadingScreen />;
  }

  return (
    <AppStateProvider value={appState}>
      <AppLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        minigameFrequency={minigameFrequency}
        onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
        isAuthenticated={isAuthenticated}
        authEmail={displayEmail}
        authAddress={displayAddress}
        onSignOut={() => {
          signOut();
          hardResetToFreshUser();
        }}
        categories={categories}
        progressStats={progressStats}
      >
        <main
          className={`block flex-1 min-h-0 min-w-0 w-full ${viewMode === 'card' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
          ref={phrasesCallbackRef}
          aria-live="polite"
        >
          {viewMode === 'card' ? (
            <div className="relative flex h-full w-full flex-col max-w-[800px] mx-auto">
              <CardDeckView
                groupedWords={streamGroupedWords}
                renderCard={renderCardForDeck}
                renderMiniGame={renderMiniGameForDeck}
              />
            </div>
          ) : (
            <div className="app-content-column flex flex-col gap-[18px] flex-1 min-h-0">
              {filteredWords.length === 0 ? (
                <div className="p-8 text-center text-text-soft">No words match your current filters.</div>
              ) : (
                <VirtualizedWordList
                  key="stream"
                  dataTab="stream"
                  groupedWords={streamGroupedWords}
                  renderCard={renderCard}
                  renderMiniGame={renderMiniGame}
                  showHeaders={false}
                  scrollElement={phrasesScrollElement}
                  emptyMessage="No words to display."
                  stageFooter={(stageIndex) => {
                    const isLastMainSlot =
                      (stageIndex === 1 && newWords.length > 0) ||
                      (stageIndex === 0 && newWords.length === 0);
                    if (!isLastMainSlot || settlingWords.length === 0) return null;
                    return (
                      <div className="p-4 px-4 text-center border-t border-border-subtle mt-4">
                        <button
                          type="button"
                          className="bg-background-elevated border border-border-subtle rounded-lg px-6 py-3 text-sm text-text cursor-pointer transition-all font-medium hover:bg-background-elevated"
                          onClick={() => setShowNotReady(!showNotReady)}
                        >
                          {showNotReady ? 'Hide' : 'Show'} {settlingWords.length} word{settlingWords.length !== 1 ? 's' : ''} settling in before repeat
                        </button>
                      </div>
                    );
                  }}
                />
              )}
            </div>
          )}
        </main>
      </AppLayout>
    </AppStateProvider>
  );
}
