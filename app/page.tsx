'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Word } from '@/data/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { usePanelClose } from '@/hooks/usePanelClose';
import { useTopMenuHandlers } from '@/hooks/useTopMenuHandlers';
import { getAvailableCategories, STAGES, isDue, NormalizedWord, normalizeWords } from '@/lib/words';
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
import { StickyMiniGameCard } from '@/components/StickyMiniGameCard';
import { LoadingScreen } from '@/components/LoadingScreen';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { CardDeckView } from '@/components/CardDeckView';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';
import { deleteDeviceId } from '@/lib/device-id';
import { resetSyncIdentity } from '@/lib/sync';


export default function Home() {
  const { words, isLoading: isLoadingWords } = useWordsLoader();
  const { isConnected, email, authProvider, address: walletAddress, signOut } = useAuth();
  const didHardResetRef = useRef(false);

  const hardResetToFreshUser = useCallback(() => {
    if (didHardResetRef.current) return;
    didHardResetRef.current = true;
    // Clear local identity (deviceId) + in-memory sync hint, then reload
    // so all React state (progress, score, stream, dismissed games) resets.
    resetSyncIdentity();
    deleteDeviceId();
    window.location.reload();
  }, []);

  // Memoize normalized words so we don't recompute on every render
  const normalizedWords = useMemo(
    () => (words.length > 0 ? normalizeWords(words as Word[]) : []),
    [words]
  );

  const linkPayload = useMemo(
    () => (walletAddress ? { email: email ?? null, authProvider: authProvider ?? null } : undefined),
    [walletAddress, email, authProvider]
  );

  const {
    role,
    setRole,
    getWordDisplayMode,
    showAll,
    setShowAll,
    progress,
    memoryHooks,
    selectedCategories,
    showEnglish,
    setShowEnglish,
    showCategoryBadges,
    setShowCategoryBadges,
    theme,
    setTheme,
    settingsOpen,
    setSettingsOpen,
    progressOpen,
    setProgressOpen,
    categoryOpen,
    setCategoryOpen,
    memoryHooksOpen,
    setMemoryHooksOpen,
    markKnown,
    markReallyKnown,
    markUnknown,
    filteredWords,
    toggleCategory,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    userId,
    userWalletAddress,
    userEmail,
    isHydrated,
    gameScore,
    setGameScore,
  } = useAppState(normalizedWords, walletAddress, linkPayload);

  // Treat "authenticated" as an active Reown connection.
  // Server-linked wallet/email may exist, but a disconnect should immediately show signed-out UI.
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

  // originalCombined is the word list captured at the start of each filter session.
  // It never changes when words are marked known/unknown — only when selectedCategories
  // changes. Anchors computed from it therefore keep stable originalIndex values, which
  // is what prevents minigames from disappearing as the stream shrinks.
  const [originalCombined, setOriginalCombined] = useState<NormalizedWord[]>([]);
  const [originalIndexMap, setOriginalIndexMap] = useState<Map<string, number>>(new Map());
  // Tracks the categories key at the time originalCombined was last captured.
  // null ensures the first session always captures a snapshot.
  const lastCategoriesKeyRef = useRef<string | null>(null);
  // Always holds the most-recent combined value without causing effect re-runs.
  const latestCombinedRef = useRef<NormalizedWord[]>([]);
  // Locks game words by game ID once first computed so they never change
  // mid-session. Cleared when categories change (same time as the snapshot reset).
  const lockedGameWordsRef = useRef<Map<string, NormalizedWord[]>>(new Map());
  const categories = useMemo(
    () => getAvailableCategories(normalizedWords),
    [normalizedWords]
  );
  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);

  // Load preferred minigame frequency from localStorage (default 2–4)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('wordlink-minigame-frequency');
    if (!stored) return;
    if (stored === 'off') {
      setMinigameFrequency('off');
      return;
    }
    const legacy: Record<string, MinigameFrequencyRange> = {
      '2-5': { min: 2, max: 5 },
      '3-7': { min: 3, max: 7 },
      '5-10': { min: 5, max: 10 },
    };
    if (legacy[stored]) {
      setMinigameFrequency(legacy[stored]);
      return;
    }
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

  // Callback ref: fires immediately when <main> mounts, guaranteeing scroll element is set
  const phrasesCallbackRef = useCallback((node: HTMLElement | null) => {
    phrasesRef.current = node;
    setPhrasesScrollElement(node);
  }, []);

  // Trigger re-render when cards become due for review
  useDueTimer(progress);

  // Close panels when clicking outside
  usePanelClose(setSettingsOpen, setProgressOpen, setCategoryOpen, setMemoryHooksOpen);

  // Attach press handlers to cover targets (supports virtualized mounts)
  useEffect(() => {
    if (!phrasesRef.current) return;

    const cleanupMap = new Map<HTMLElement, () => void>();

    const attachPressHandlers = (el: HTMLElement) => {
      if (cleanupMap.has(el)) return; // already attached

      let pressed = false;
      let touchStartX = 0;
      let touchStartY = 0;
      let isScrolling = false;
      let pressTimeout: number | null = null;
      let hasMoved = false;
      const SCROLL_THRESHOLD = 5;
      const PRESS_DELAY = 150;

      const setPressed = (value: boolean) => {
        pressed = value;
        if (pressed) {
          el.classList.add('is-pressed');
        } else {
          el.classList.remove('is-pressed');
        }
      };

      const onDown = (e: MouseEvent | TouchEvent) => {
        if (e.type === 'touchstart' && 'touches' in e && e.touches.length > 0) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          isScrolling = false;
          hasMoved = false;

          pressTimeout = window.setTimeout(() => {
            if (!isScrolling && !hasMoved) {
              setPressed(true);
            }
          }, PRESS_DELAY);
          return;
        }

        e.preventDefault();
        setPressed(true);
      };

      const onMove = (e: TouchEvent) => {
        if (e.touches.length > 0 && touchStartX !== 0) {
          const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
          const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
          const totalDelta = Math.max(deltaX, deltaY);

          // Only mark as moved if movement exceeds threshold
          // This allows for small natural finger movements while still holding
          if (totalDelta > SCROLL_THRESHOLD) {
            hasMoved = true;
            isScrolling = true;
            setPressed(false);
            if (pressTimeout) {
              clearTimeout(pressTimeout);
              pressTimeout = null;
            }
            return;
          }

          // Don't cancel timeout for tiny movements - user is still holding still
          // Only prevent default if already pressed
          if (!isScrolling && pressed) {
            e.preventDefault();
          }
        }
      };

      const onUp = () => {
        if (pressTimeout) {
          clearTimeout(pressTimeout);
          pressTimeout = null;
        }
        setPressed(false);
        touchStartX = 0;
        touchStartY = 0;
        isScrolling = false;
        hasMoved = false;
      };

      el.addEventListener('mousedown', onDown);
      el.addEventListener('touchstart', onDown, { passive: true });
      el.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);
      window.addEventListener('touchcancel', onUp);

      const cleanup = () => {
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('touchstart', onDown);
        el.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('touchcancel', onUp);
        if (pressTimeout) clearTimeout(pressTimeout);
      };

      cleanupMap.set(el, cleanup);
    };

    const attachExisting = () => {
      const coverTargets = phrasesRef.current?.querySelectorAll('.cover-target') || [];
      coverTargets.forEach((el) => attachPressHandlers(el as HTMLElement));
    };

    attachExisting();

    // Observe DOM changes so we also attach to virtualized elements rendered later
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList.contains('cover-target')) {
            attachPressHandlers(node);
          }
          node.querySelectorAll?.('.cover-target').forEach((child) => attachPressHandlers(child as HTMLElement));
        });

        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const cleanup = cleanupMap.get(node);
          if (cleanup) {
            cleanup();
            cleanupMap.delete(node);
          }
          node.querySelectorAll?.('.cover-target').forEach((child) => {
            const childCleanup = cleanupMap.get(child as HTMLElement);
            if (childCleanup) {
              childCleanup();
              cleanupMap.delete(child as HTMLElement);
            }
          });
        });
      });
    });

    observer.observe(phrasesRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupMap.forEach((cleanup) => cleanup());
      cleanupMap.clear();
    };
  }, [selectedCategories, showAll, role]);

  // Reset expandable sections when filters change
  useEffect(() => {
    setShowNotReady(false);
  }, [selectedCategories]);

  const closeAllPanels = useCallback(() => {
    setSettingsOpen(false);
    setProgressOpen(false);
    setCategoryOpen(false);
    setMemoryHooksOpen(false);
  }, [setSettingsOpen, setProgressOpen, setCategoryOpen, setMemoryHooksOpen]);

  const topMenuHandlers = useTopMenuHandlers({
    showAll,
    setShowAll,
    categoryOpen,
    setCategoryOpen,
    progressOpen,
    setProgressOpen,
    memoryHooksOpen,
    setMemoryHooksOpen,
    settingsOpen,
    setSettingsOpen,
    closeAllPanels,
    selectedCategories,
  });

  const statsWords = useMemo(() => {
    return getProgressStatsWords(normalizedWords, selectedCategories);
  }, [normalizedWords, selectedCategories]);

  // Split filteredWords into three buckets for single-stream ordering
  const { dueWords, newWords, settlingWords } = useMemo(() => {
    if (!isHydrated) return { dueWords: [] as NormalizedWord[], newWords: [] as NormalizedWord[], settlingWords: [] as NormalizedWord[] };

    const due: NormalizedWord[] = [];
    const newW: NormalizedWord[] = [];
    const settling: NormalizedWord[] = [];

    filteredWords.forEach((word) => {
      const prog = progress[word.id];
      if (!prog || prog.stageIndex === 0) {
        newW.push(word);
      } else if (isDue(prog)) {
        due.push(word);
      } else {
        settling.push(word);
      }
    });

    // Most overdue first
    due.sort((a, b) => (progress[a.id]?.nextDueAt ?? 0) - (progress[b.id]?.nextDueAt ?? 0));

    return { dueWords: due, newWords: newW, settlingWords: settling };
  }, [filteredWords, progress, isHydrated]);

  const readyCount = dueWords.length;

  // Words with at least stageIndex 1 — used as the game word pool
  const learnedPool = useMemo(
    () => filteredWords.filter(w => (progress[w.id]?.stageIndex ?? 0) > 0),
    [filteredWords, progress]
  );

  // Active learning stream: due words first, then new words.
  const combined = useMemo(() => [...dueWords, ...newWords], [dueWords, newWords]);

  // Keep latestCombinedRef current so the snapshot effect can read it
  // without needing combined in its dependency array.
  latestCombinedRef.current = combined;

  // Snapshot the combined list once per filter session.
  // The snapshot is taken when we first have both hydration and words, and
  // is reset whenever selectedCategories changes.
  // It does NOT reset when words are marked known/unknown — that's the whole
  // point: originalIndexMap stays stable so anchor positions don't shift.
  //
  // hasWords is in the dep array to handle the race where isHydrated becomes
  // true before the word list loads: the effect fires but skips the snapshot
  // (latestCombinedRef is empty). When words then arrive, hasWords flips from
  // false → true and the effect fires again, correctly taking the snapshot.
  const currentCategoriesKey = [...selectedCategories].sort().join(',');
  const hasWords = combined.length > 0;
  useEffect(() => {
    if (!isHydrated || !hasWords) return;
    // Skip if we already have a snapshot for the current filter session.
    if (currentCategoriesKey === lastCategoriesKeyRef.current && originalCombined.length > 0) return;

    lastCategoriesKeyRef.current = currentCategoriesKey;
    // New filter session: clear locked game words so fresh content is picked.
    lockedGameWordsRef.current = new Map();
    const snapshot = [...latestCombinedRef.current];
    setOriginalCombined(snapshot);
    setOriginalIndexMap(new Map(snapshot.map((w, i) => [w.id, i])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, hasWords, currentCategoriesKey]);
  // latestCombinedRef is a ref (always current) — intentionally not a dep.

  // Compute stable game anchors from the snapshot.
  // Anchor positions come from Phase A of computeGameAnchors (pure gap PRNG,
  // independent of learnedPool size) so they never shift when words are marked.
  // Game content (the 4 words per game) is locked in lockedGameWordsRef on
  // first generation and never overwritten, even when learnedPool changes.
  // The lock is cleared only when categories change (new filter session).
  const gameAnchors = useMemo((): GameAnchor[] => {
    if (minigameFrequency === 'off' || originalCombined.length === 0) {
      return [];
    }
    const { min, max } = minigameFrequency;
    const rawAnchors = computeGameAnchors(originalCombined, learnedPool, minigameSeed, {
      minInterval: min,
      maxInterval: max,
    });

    // Lock content: write words for this game ID exactly once.
    // Subsequent recomputations (learnedPool grows, etc.) return the locked words.
    return rawAnchors.map(anchor => {
      if (!lockedGameWordsRef.current.has(anchor.id)) {
        lockedGameWordsRef.current.set(anchor.id, anchor.words);
      }
      return { ...anchor, words: lockedGameWordsRef.current.get(anchor.id)! };
    });
  }, [originalCombined, learnedPool, minigameSeed, minigameFrequency]);

  // Build groupedWords for VirtualizedWordList:
  // Slot 0 = due words (+ injected games), Slot 1 = new words (+ injected games),
  // Slots 2-10 = settling-in (when expanded, no games injected)
  const streamGroupedWords = useMemo(() => {
    const groups: (NormalizedWord | MiniGameConfig)[][] = STAGES.map(() => []);
    if (!isHydrated) return groups;

    // composeStream is a pure function: it re-inserts each game by scanning
    // combined for the highest remaining word with origIdx <= anchor.anchorOriginalIndex.
    // Because anchors are keyed to originalIndex (not array position or word ID),
    // games stay in the stream even as words are removed around them.
    let wordStream: (NormalizedWord | MiniGameConfig)[];
    if (minigameFrequency === 'off' || gameAnchors.length === 0) {
      wordStream = combined;
    } else {
      wordStream = composeStream(combined, originalIndexMap, gameAnchors);
    }

    // Word stream: due words → slot 0, new words → slot 1.
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
  }, [combined, dueWords.length, settlingWords, showNotReady, progress, isHydrated, gameAnchors, originalIndexMap, minigameFrequency]);


  // Memoized card renderer to avoid recreating functions on each render - must be before early return
  // Accepts optional stageIndex for VirtualizedWordList compatibility
  const renderCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    const prog = progress[word.id] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
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
      <div key={config.id} className="pt-8">
        <StickyMiniGameCard
          config={config}
          role={role}
          onDismiss={() => setDismissedGames(prev => new Set([...prev, config.id]))}
          onResult={(won) => setGameScore(prev => Math.max(0, prev + (won ? 1 : -1)))}
        />
      </div>
    );
  }, [dismissedGames, role]);

  const renderCardForDeck = useCallback(
    (word: NormalizedWord, stageIndex: number, onComplete: () => void) => {
      const prog = progress[word.id] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      return (
        <div key={word.id} className="h-full">
          <WordCard
            word={word}
            progress={prog}
            role={role}
            modeIndex={getWordDisplayMode(word.id)}
            showAll={showAll}
            memoryHook={getMemoryHook(word.id)}
            suggestedHook={getSuggestedMemoryHook(word)}
            onKnown={() => { markKnown(word.id); onComplete(); }}
            onReallyKnown={() => { markReallyKnown(word.id); onComplete(); }}
            onUnknown={() => { markUnknown(word.id); onComplete(); }}
            onMemoryHookChange={(hook) => setMemoryHook(word.id, hook)}
            isMoved={lastMovedId === word.id}
            showEnglish={showEnglish}
            showCategoryBadges={showCategoryBadges}
            fullscreen
          />
        </div>
      );
    },
    [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges]
  );

  const renderMiniGameForDeck = useCallback(
    (config: MiniGameConfig, onComplete: () => void) => (
      <div key={config.id} className="h-full">
        <StickyMiniGameCard
          config={config}
          role={role}
          onDismiss={() => {
            setDismissedGames(prev => new Set([...prev, config.id]));
            onComplete();
          }}
          onResult={(won) => {
            setGameScore(prev => Math.max(0, prev + (won ? 1 : -1)));
            onComplete();
          }}
        />
      </div>
    ),
    [dismissedGames, role, setGameScore]
  );

  // Memoize progress stats (must be before early return to keep hook order stable)
  const progressStats = useMemo(
    () => calculateProgressStats(statsWords, progress, readyCount),
    [statsWords, progress, readyCount]
  );

  // Don't render main content until hydrated and words are loaded to avoid hydration mismatches
  if (!isHydrated || isLoadingWords) {
    return <LoadingScreen />;
  }

  return (
    <AppLayout
      topMenuHandlers={topMenuHandlers}
      role={role}
      onRoleChange={setRole}
      showEnglish={showEnglish}
      onShowEnglishChange={setShowEnglish}
      showCategoryBadges={showCategoryBadges}
      onShowCategoryBadgesChange={setShowCategoryBadges}
      theme={theme}
      onThemeChange={setTheme}
      minigameFrequency={minigameFrequency}
      onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      userId={userId}
      userWalletAddress={userWalletAddress}
      userEmail={userEmail}
      isAuthenticated={isAuthenticated}
      authEmail={displayEmail}
      authAddress={displayAddress}
      onSignOut={() => {
        signOut();
        // Also reset app state to a fresh user immediately.
        hardResetToFreshUser();
      }}
      categories={categories}
      selectedCategories={selectedCategories}
      onToggleCategory={toggleCategory}
      progressStats={progressStats}
      score={gameScore}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      progressOpen={progressOpen}
      setProgressOpen={setProgressOpen}
      categoryOpen={categoryOpen}
      setCategoryOpen={setCategoryOpen}
      memoryHooksOpen={memoryHooksOpen}
      setMemoryHooksOpen={setMemoryHooksOpen}
    >

      <main
        className={`block flex-1 min-h-0 min-w-0 w-full ${viewMode === 'card' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
        ref={phrasesCallbackRef}
        aria-live="polite"
      >
        {viewMode === 'card' ? (
          <div className="flex h-full w-full flex-col max-w-[800px] mx-auto">
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
                  // Show "settling in" button after slot 1 (new words), or slot 0 if no new words
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
  );
}
