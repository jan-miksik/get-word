'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Word } from '@/data/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { usePanelClose } from '@/hooks/usePanelClose';
import { useTopMenuHandlers } from '@/hooks/useTopMenuHandlers';
import { getAvailableCategories, STAGES, isDue, NormalizedWord, normalizeWords } from '@/lib/words';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import { injectMinigames, MiniGameConfig } from '@/lib/minigames';
import { AppLayout } from '@/components/AppLayout';
import { WordCard } from '@/components/WordCard';
import { MiniGameCard } from '@/components/MiniGameCard';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';


export default function Home() {
  const { words, isLoading: isLoadingWords } = useWordsLoader();
  const { isConnected, email, authProvider, address: walletAddress, signOut } = useAuth();

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
  } = useAppState(normalizedWords, walletAddress, linkPayload);

  // Logged in = Reown connected now OR account already linked on server (wallet/email saved)
  const isAuthenticated = isConnected || !!(userWalletAddress || userEmail);
  const displayEmail = email ?? userEmail ?? undefined;
  const displayAddress = walletAddress ?? userWalletAddress ?? undefined;

  const [showNotReady, setShowNotReady] = useState(false);
  const [dismissedGames, setDismissedGames] = useState<Set<string>>(new Set());
  const categories = useMemo(
    () => getAvailableCategories(normalizedWords),
    [normalizedWords]
  );
  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);

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

  // Build groupedWords for VirtualizedWordList:
  // Slot 0 = due words (+ injected games), Slot 1 = new words (+ injected games),
  // Slots 2-10 = settling-in (when expanded, no games injected)
  const streamGroupedWords = useMemo((): (NormalizedWord | MiniGameConfig)[][] => {
    const groups: (NormalizedWord | MiniGameConfig)[][] = STAGES.map(() => []);
    if (!isHydrated) return groups;

    // Inject games into the combined due+new stream then re-split by boundary
    const combined = [...dueWords, ...newWords];
    const injected = injectMinigames(combined, learnedPool, role);
    const dueCount = dueWords.length;
    let wordsSeen = 0;
    injected.forEach(item => {
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
  }, [dueWords, newWords, settlingWords, showNotReady, progress, isHydrated, learnedPool, role]);


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
        <MiniGameCard
          config={config}
          role={role}
          onDismiss={() => setDismissedGames(prev => new Set([...prev, config.id]))}
        />
      </div>
    );
  }, [dismissedGames, role]);

  // Memoize progress stats (must be before early return to keep hook order stable)
  const progressStats = useMemo(
    () => calculateProgressStats(statsWords, progress, readyCount),
    [statsWords, progress, readyCount]
  );

  // Don't render main content until hydrated and words are loaded to avoid hydration mismatches
  if (!isHydrated || isLoadingWords) {
    return (
      <div className="app">
        <div className="p-8 text-center">Loading...</div>
      </div>
    );
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
      userId={userId}
      userWalletAddress={userWalletAddress}
      userEmail={userEmail}
      isAuthenticated={isAuthenticated}
      authEmail={displayEmail}
      authAddress={displayAddress}
      onSignOut={signOut}
      categories={categories}
      selectedCategories={selectedCategories}
      onToggleCategory={toggleCategory}
      progressStats={progressStats}
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
        className="block flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden"
        ref={phrasesCallbackRef}
        aria-live="polite"
      >
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
      </main>

    </AppLayout>
  );
}
