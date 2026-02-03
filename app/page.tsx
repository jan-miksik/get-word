'use client';

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Word } from '@/data/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { usePanelClose } from '@/hooks/usePanelClose';
import { useTopMenuHandlers } from '@/hooks/useTopMenuHandlers';
import { getAvailableCategories, STAGES, isDue, NormalizedWord, normalizeWords, matchesCategoryFilter } from '@/lib/words';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import { AppLayout } from '@/components/AppLayout';
import { BottomNav } from '@/components/BottomNav';
import { WordCard } from '@/components/WordCard';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';


export default function Home() {
  const { words, isLoading: isLoadingWords } = useWordsLoader();
  const { isConnected, email, address: walletAddress, signOut } = useAuth();

  // Memoize normalized words so we don't recompute on every render
  const normalizedWords = useMemo(
    () => (words.length > 0 ? normalizeWords(words as Word[]) : []),
    [words]
  );

  const {
    role,
    setRole,
    modeIndex,
    setModeIndex,
    showAll,
    setShowAll,
    currentTab,
    setCurrentTab,
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
    isHydrated,
  } = useAppState(normalizedWords, walletAddress);

  const [showWaitingForRepeat, setShowWaitingForRepeat] = useState(false);
  const [showNotReady, setShowNotReady] = useState(false);
  const categories = useMemo(
    () => getAvailableCategories(normalizedWords),
    [normalizedWords]
  );
  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);

  // Set scroll element before paint so VirtualizedWordList uses correct scroll container on first render
  useLayoutEffect(() => {
    setPhrasesScrollElement(phrasesRef.current);
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
  }, [currentTab, selectedCategories, showAll, modeIndex, role]);

  // Reset expandable sections when switching tabs or filters change
  useEffect(() => {
    setShowWaitingForRepeat(false);
    setShowNotReady(false);
  }, [currentTab, selectedCategories]);

  const closeAllPanels = useCallback(() => {
    setSettingsOpen(false);
    setProgressOpen(false);
    setCategoryOpen(false);
    setMemoryHooksOpen(false);
  }, [setSettingsOpen, setProgressOpen, setCategoryOpen, setMemoryHooksOpen]);

  const topMenuHandlers = useTopMenuHandlers({
    modeIndex,
    setModeIndex,
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

  // Group words by stage (memoized for performance) - must be before early return
  const statsWords = useMemo(() => {
    return getProgressStatsWords(normalizedWords, selectedCategories);
  }, [normalizedWords, selectedCategories]);

  // Calculate readyCount - must match exactly what filteredWords contains when currentTab === 'ready'
  // This ensures the count matches what's actually displayed in the ready tab
  const readyCount = useMemo(() => {
    if (!isHydrated) return 0;

    const categoryFiltered = normalizedWords.filter((word) =>
      matchesCategoryFilter(word, selectedCategories)
    );

    // Filter to only due words (same as filteredWords for ready tab)
    const readyWords = categoryFiltered.filter((word) => {
      const prog = progress[word.id];
      if (!prog) return false;
      return isDue(prog);
    });

    return readyWords.length;
  }, [normalizedWords, selectedCategories, progress, isHydrated]);

  const { groupedWords, groupedWordsWaiting, notReadyCount } = useMemo(() => {
    const grouped = STAGES.map(() => [] as NormalizedWord[]);
    const groupedWaiting = STAGES.map(() => [] as NormalizedWord[]);
    let notReady = 0;

    filteredWords.forEach((word) => {
      const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      const due = isDue(prog);
      if (currentTab === 'all' && !due && prog.stageIndex > 0) {
        notReady += 1;
      }
      if (currentTab === 'ready' && !due) return;
      const sIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));

      if (currentTab === 'all' && due) {
        groupedWaiting[sIdx].push(word);
      } else {
        grouped[sIdx].push(word);
      }
    });

    return { groupedWords: grouped, groupedWordsWaiting: groupedWaiting, notReadyCount: notReady };
  }, [filteredWords, progress, currentTab]);

  const groupedWordsForAll = useMemo(() => {
    if (showNotReady) return groupedWords;
    return groupedWords.map((words, stageIndex) => (stageIndex === 0 ? words : []));
  }, [groupedWords, showNotReady]);


  // Memoized card renderer to avoid recreating functions on each render - must be before early return
  // Accepts optional stageIndex for VirtualizedWordList compatibility
  const renderCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    const prog = progress[word.id] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    return (
      <div key={word.id} className="pt-1">
        <WordCard
          word={word}
          progress={prog}
          role={role}
          modeIndex={modeIndex}
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
  }, [progress, role, modeIndex, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges]);

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
      isAuthenticated={isConnected}
      authEmail={email ?? undefined}
      authAddress={walletAddress}
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
        ref={phrasesRef}
        aria-live="polite"
      >
        <div className="app-content-column flex flex-col gap-[18px] flex-1 min-h-0">
          {filteredWords.length === 0 ? (
            <div className="p-8 text-center text-text-soft">
              {currentTab === 'ready' ? 'All caught up!' : 'No words match your current filters.'}
            </div>
          ) : currentTab === 'ready' ? (
            /* Virtualized list for "Ready to repeat" tab - better performance with many cards */
            <VirtualizedWordList
              key="ready"
              dataTab="ready"
              groupedWords={groupedWords}
              renderCard={renderCard}
              emptyMessage="All caught up! No words ready for review."
              scrollElement={phrasesScrollElement}
            />
          ) : (
            <>
              {/* Virtualized list for "All words" tab */}
              <VirtualizedWordList
                key="all"
                dataTab="all"
                groupedWords={groupedWordsForAll}
                renderCard={renderCard}
                scrollElement={phrasesScrollElement}
                stageFooter={(stageIndex) => {
                  if (stageIndex !== 0 || notReadyCount === 0) return null;
                  return (
                    <div className="p-4 px-4 text-center border-t border-border-subtle mt-4">
                      <button
                        type="button"
                        className="bg-background-elevated border border-border-subtle rounded-lg px-6 py-3 text-sm text-text cursor-pointer transition-all font-medium hover:bg-background-elevated"
                        onClick={() => setShowNotReady(!showNotReady)}
                      >
                        {showNotReady ? 'Hide' : 'Show'} {notReadyCount} word{notReadyCount !== 1 ? 's' : ''} settling in before repeat
                      </button>
                    </div>
                  );
                }}
              />

              {/* Words waiting for repeat - hidden by default in "all" tab */}
              {readyCount > 0 && (
                <>
                  {!showWaitingForRepeat && (
                    <div className="p-4 text-center border-t border-b border-border-subtle mt-4 sticky top-0 bg-background backdrop-blur-xl z-10 shadow-soft">
                      <button
                        type="button"
                        className="bg-background-elevated border border-border-subtle rounded-lg px-6 py-3 text-sm text-text cursor-pointer transition-all font-medium hover:bg-background-elevated"
                        onClick={() => setShowWaitingForRepeat(true)}
                      >
                        Show {readyCount} word{readyCount !== 1 ? 's' : ''} waiting for repeat
                      </button>
                    </div>
                  )}
                  {showWaitingForRepeat && (
                    <>
                      <div className="p-4 px-4 border-t border-border-subtle mt-4 flex justify-between items-center bg-background-elevated">
                        <h2 className="m-0 text-base font-semibold text-text-soft">
                          Waiting for repeat ({readyCount})
                        </h2>
                        <button
                          type="button"
                          className="bg-transparent border border-border-subtle rounded-lg px-4 py-2 text-sm text-text-soft cursor-pointer transition-all hover:bg-background-elevated hover:text-text"
                          onClick={() => setShowWaitingForRepeat(false)}
                        >
                          Hide
                        </button>
                      </div>
                      {STAGES.map((stage, stageIndex) => {
                        const items = groupedWordsWaiting[stageIndex];
                        if (!items.length) return null;

                        return (
                          <section key={`waiting-${stageIndex}`} className="mt-4">
                            <h2 className="text-[0.7rem] uppercase tracking-[0.12em] text-text-soft m-0 mb-1 mx-0.5 opacity-90">{stage.name}</h2>
                            {items.map(renderCard)}
                          </section>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      <BottomNav
        currentTab={currentTab}
        readyCount={readyCount}
        onTabChange={setCurrentTab}
      />
    </AppLayout>
  );
}
