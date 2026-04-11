'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Word } from '@/data/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { useWordStream } from '@/hooks/useWordStream';
import { usePressHandlers } from '@/hooks/usePressHandlers';
import {
  getAvailableCategories,
  STAGES,
  NormalizedWord,
  normalizeWords,
  shouldShowMemoryHookForStage,
} from '@/lib/words';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import {
  computeGameAnchors,
  composeStream,
  enforceMinigameMinGap,
  pruneAnchorsForCurrentSize,
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
import type { ProgressData } from '@/lib/sync';
import { AppStateProvider } from '@/context/AppStateContext';


export default function Home() {
  const { words, isLoading: isLoadingWords } = useWordsLoader();
  const { isConnected, email, authProvider, address: walletAddress, signOut, signIn } = useAuth();

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
  } = appState;

  // Use synced words (from word_list_items) when available, fall back to static
  const activeWords = syncedWords ?? normalizedWords;

  const isAuthenticated = Boolean(userId || isConnected);
  const isWaitingForLinkedProfile = Boolean(
    isConnected &&
      walletAddress &&
      !userId &&
      (!hasLinkWalletError || isLinkingWallet)
  );
  const displayEmail = userEmail ?? email ?? undefined;
  const displayAddress = userWalletAddress ?? walletAddress ?? undefined;

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
    return Math.floor(Math.random() * 1_000_000_000);
  });
  const lockedDeckCardStateRef = useRef<Map<string, { modeIndex: number; progress: ProgressData }>>(
    new Map()
  );
  const frozenDeckRef = useRef<{
    key: string;
    groups: (NormalizedWord | MiniGameConfig)[][];
  } | null>(null);
  const hasAutoPromptedRef = useRef(false);

  // Minigame seed is per run so repeated visits feel less predictable, while
  // the generated plans remain stable for the current session.

  const categories = useMemo(
    () => getAvailableCategories(activeWords),
    [activeWords]
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
    return getProgressStatsWords(activeWords, selectedCategories);
  }, [activeWords, selectedCategories]);

  // Split filteredWords into due / new / settling
  const { dueWords, newWords, settlingWords } = useWordStream(filteredWords, progress, isHydrated);

  const readyCount = dueWords.length;

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

          let minOrigIdx = Number.POSITIVE_INFINITY;
          let maxOrigIdx = Number.NEGATIVE_INFINITY;
          for (const w of words) {
            const v = plan.originalIndexMap.get(w.id);
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            if (v < minOrigIdx) minOrigIdx = v;
            if (v > maxOrigIdx) maxOrigIdx = v;
          }
          if (!Number.isFinite(minOrigIdx)) minOrigIdx = 0;
          if (!Number.isFinite(maxOrigIdx)) maxOrigIdx = 0;

          // Only keep anchors that are relevant for the currently visible slice
          // of this segment. Without this, anchors tied to words already removed
          // from the segment can "float" to the top and create clusters of games.
          const windowedAnchors = plan.anchors.filter(
            (a) => a.anchorOriginalIndex >= minOrigIdx && a.anchorOriginalIndex <= maxOrigIdx,
          );

          const anchorsForCompose =
            dismissedGames.size > 0
              ? windowedAnchors.filter((a) => !dismissedGames.has(a.id))
              : windowedAnchors;

          const prunedAnchors = pruneAnchorsForCurrentSize(anchorsForCompose, words.length, min);
          return composeStream(words, plan.originalIndexMap, prunedAnchors);
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

  // Frozen deck for card mode: snapshot stream once, refresh only on category/view-mode change
  const deckResetKey = `${selectedCategoriesKey}|${viewMode}`;
  if (
    viewMode === 'card' &&
    (!frozenDeckRef.current || frozenDeckRef.current.key !== deckResetKey)
  ) {
    const hasContent = streamGroupedWords.some(g => g.length > 0);
    if (hasContent) {
      frozenDeckRef.current = { key: deckResetKey, groups: streamGroupedWords };
    }
  }
  const cardDeckGroups = frozenDeckRef.current?.groups ?? streamGroupedWords;

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
          showPronunciation={showPronunciation}
          categoryOrder={categoryOrder}
          showMemoryHook={shouldRenderMemoryHook(word.id)}
        />
      </div>
    );
  }, [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook]);

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
            showPronunciation={showPronunciation}
            categoryOrder={categoryOrder}
            showMemoryHook={shouldRenderMemoryHook(word.id)}
            fullscreen
          />
        </div>
      );
    },
    [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook]
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

  useEffect(() => {
    if (!isHydrated || isLoadingWords || isAuthenticated || hasAutoPromptedRef.current) return;
    hasAutoPromptedRef.current = true;
    signIn();
  }, [isHydrated, isLoadingWords, isAuthenticated, signIn]);

  if (!isHydrated || isLoadingWords || isLinkingWallet || isWaitingForLinkedProfile) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-background-elevated p-7 flex flex-col gap-4">
          <h1 className="m-0 text-2xl font-semibold text-text">Connect</h1>
          <p className="m-0 text-sm text-text-soft">
            Continue with email or Google to access WordLink. Wallet connection is optional and available in the same modal.
          </p>
          <button
            type="button"
            onClick={signIn}
            className="auth-button auth-button--large"
          >
            Connect
          </button>
        </div>
      </main>
    );
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
        onSignOut={async () => {
          await signOut();
          window.location.assign('/');
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
                groupedWords={cardDeckGroups}
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
