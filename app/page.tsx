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
  enforceMinigameMinGap,
  sanitizeMinigameFrequency,
  type MiniGameConfig,
  type MinigameFrequencyRange,
  type GameAnchor,
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
  type SegmentKind = 'repeat' | 'settling' | 'new';
  type SegmentPlan = {
    resetKey: string;
    configKey: string;
    learnedPoolSig: string;
    originalWords: NormalizedWord[];
    originalIndexMap: Map<string, number>;
    anchors: GameAnchor[];
  };
  const stableMinigamePlansRef = useRef<Record<SegmentKind, SegmentPlan | null>>({
    repeat: null,
    settling: null,
    new: null,
  });
  const [minigameSeed] = useState<number>(() => {
    if (typeof window === 'undefined') {
      return Math.floor(Math.random() * 1_000_000_000);
    }
    const stored = window.localStorage.getItem('wordlink-minigame-seed');
    const parsed = stored ? Number(stored) : NaN;
    if (Number.isFinite(parsed)) return parsed;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    window.localStorage.setItem('wordlink-minigame-seed', String(seed));
    return seed;
  });
  const lockedDeckCardStateRef = useRef<Map<string, { modeIndex: number; progress: ProgressData }>>(
    new Map()
  );

  // Minigame seed persisted per device to keep injections stable across refreshes.

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
    if (legacy[stored]) { setMinigameFrequency(sanitizeMinigameFrequency(legacy[stored])); return; }
    try {
      const parsed = JSON.parse(stored) as MinigameFrequencyRange;
      if (parsed === 'off' || (typeof parsed === 'object' && typeof parsed?.min === 'number' && typeof parsed?.max === 'number')) {
        setMinigameFrequency(sanitizeMinigameFrequency(parsed));
      }
    } catch {
      // ignore invalid JSON
    }
  }, []);

  // Persist minigame frequency preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const safe = sanitizeMinigameFrequency(minigameFrequency);
    const toStore = safe === 'off' ? 'off' : JSON.stringify(safe);
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

  const selectedCategoriesKey = useMemo(() => {
    return Array.from(selectedCategories).sort().join('|');
  }, [selectedCategories]);

  useEffect(() => {
    stableMinigamePlansRef.current = { repeat: null, settling: null, new: null };
  }, [selectedCategoriesKey]);

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

  // Active learning stream:
  // - repeats first (due, optionally "settling in")
  // - then new words
  const combined = useMemo(
    () => [...dueWords, ...(showNotReady ? settlingWords : []), ...newWords],
    [dueWords, settlingWords, newWords, showNotReady]
  );

  // Build groupedWords for VirtualizedWordList
  const streamGroupedWords = useMemo(() => {
    const groups: (NormalizedWord | MiniGameConfig)[][] = STAGES.map(() => []);
    if (!isHydrated) return groups;

    let wordStream: (NormalizedWord | MiniGameConfig)[];
    if (minigameFrequency === 'off') {
      wordStream = combined;
    } else {
      const { min, max } = minigameFrequency;
      if (combined.length === 0) {
        wordStream = [];
      } else {
        const baseResetKey = selectedCategoriesKey;
        const learnedPoolSig = `${learnedPool.length}:${learnedPool
          .slice(0, 12)
          .map((w) => w.id)
          .join(',')}`;

        const segmentSeed = (kind: SegmentKind) => {
          if (kind === 'repeat') return minigameSeed + 0;
          if (kind === 'settling') return minigameSeed + 10007;
          return minigameSeed + 20011; // new
        };

        const injectSegment = (kind: SegmentKind, words: NormalizedWord[]) => {
          if (words.length === 0) return [] as (NormalizedWord | MiniGameConfig)[];

          const seed = segmentSeed(kind);
          const configKey = `${seed}|${min}|${max}`;
          const resetKey = `${baseResetKey}|${kind}`;
          const existing = stableMinigamePlansRef.current[kind];

          let plan =
            existing &&
            existing.resetKey === resetKey &&
            existing.configKey === configKey
              ? existing
              : {
                  resetKey,
                  configKey,
                  learnedPoolSig,
                  originalWords: [...words],
                  originalIndexMap: new Map(words.map((w, i) => [w.id, i])),
                  anchors: [] as GameAnchor[],
                };

          let appended = false;
          for (const w of words) {
            if (!plan.originalIndexMap.has(w.id)) {
              plan.originalIndexMap.set(w.id, plan.originalWords.length);
              plan.originalWords.push(w);
              appended = true;
            }
          }

          // Recompute anchors only when needed (segment membership/config/pool changes).
          if (!existing || plan !== existing || appended || plan.learnedPoolSig !== learnedPoolSig) {
            plan.learnedPoolSig = learnedPoolSig;
            plan.anchors = computeGameAnchors(plan.originalWords, learnedPool, seed, {
              minInterval: min,
              maxInterval: max,
            });
          }

          stableMinigamePlansRef.current[kind] = plan;

          const anchorsForCompose =
            dismissedGames.size > 0
              ? plan.anchors.filter((a) => !dismissedGames.has(a.id))
              : plan.anchors;

          return composeStream(words, plan.originalIndexMap, anchorsForCompose);
        };

        const repeatWords = dueWords;
        const settlingVisible = showNotReady ? settlingWords : [];
        const newOnly = newWords;

        wordStream = [
          ...injectSegment('repeat', repeatWords),
          ...injectSegment('settling', settlingVisible),
          ...injectSegment('new', newOnly),
        ];
      }
    }
    // Note: dismissed games are filtered before composeStream to avoid them
    // consuming limited insertion slots, but we keep this as a safety net.
    if (dismissedGames.size > 0) {
      wordStream = wordStream.filter(
        (item) => !('_isMinigame' in item) || !dismissedGames.has(item.id)
      );
    }
    if (minigameFrequency !== 'off') {
      wordStream = enforceMinigameMinGap(wordStream, minigameFrequency.min);
    }

    const repeatCount = dueWords.length + (showNotReady ? settlingWords.length : 0);
    let wordsSeen = 0;
    wordStream.forEach(item => {
      if (!('_isMinigame' in item)) wordsSeen++;
      if (wordsSeen <= repeatCount) {
        groups[0].push(item);
      } else {
        groups[1].push(item);
      }
    });
    return groups;
  }, [combined, learnedPool, role, minigameSeed, dueWords, settlingWords, newWords, showNotReady, progress, isHydrated, minigameFrequency, dismissedGames, selectedCategoriesKey]);

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
            onResult={(delta) => setGameScore(prev => Math.max(0, prev + delta))}
          />
        </div>
      </div>
    );
  }, [dismissedGames, role]);

  const renderCardForDeck = useCallback(
    (
      word: NormalizedWord,
      _stageIndex: number,
      onComplete: (afterExit?: () => void) => void,
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
          onResult={(delta) => {
            setGameScore(prev => Math.max(0, prev + delta));
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
                    const repeatsInStream =
                      dueWords.length + (showNotReady ? settlingWords.length : 0);
                    const footerStageIndex = repeatsInStream > 0 ? 0 : 1;
                    if (stageIndex !== footerStageIndex || settlingWords.length === 0) return null;
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
