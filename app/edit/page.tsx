'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Word } from '@/data/words';
import { getDeviceId } from '@/lib/device-id';
import { normalizeWords, getAllCategoriesWithCounts, STAGES, isDue, NormalizedWord, matchesCategoryFilter } from '@/lib/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { usePanelClose } from '@/hooks/usePanelClose';
import { useTopMenuHandlers } from '@/hooks/useTopMenuHandlers';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import { AppLayout } from '@/components/AppLayout';
import { BottomNav } from '@/components/BottomNav';
import { EditableWordCard, EDIT_ONLY_CATEGORIES } from '@/components/EditableWordCard';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { useDueTimer } from '@/hooks/useDueTimer';


export default function EditPage() {
  const router = useRouter();
  const { words, setWords, isLoading } = useWordsLoader();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Memoize normalized words so we don't recompute on every render
  const normalizedWords = useMemo(
    () => (words.length > 0 ? normalizeWords(words as Word[]) : []),
    [words]
  );
  const {
    role,
    setRole,
    getWordDisplayMode,
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
    toggleCategory: toggleCategoryFilter,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    userId,
    userWalletAddress,
    userRole,
    isHydrated,
  } = useAppState(normalizedWords);

  // Client-side guard: redirect non-editors
  useEffect(() => {
    if (!isHydrated) return;
    if (userRole !== 'editor') {
      setIsRedirecting(true);
      router.replace('/');
    }
  }, [isHydrated, userRole, router]);
  // In edit mode, always show all categories with counts from all words (not filtered)
  // Include edit-only categories (like "to fix") even if they have 0 occurrences
  const categories = useMemo(() => {
    return getAllCategoriesWithCounts(normalizedWords, normalizedWords, EDIT_ONLY_CATEGORIES);
  }, [normalizedWords]);
  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);
  const [showWaitingForRepeat, setShowWaitingForRepeat] = useState(false);
  const [showNotReady, setShowNotReady] = useState(false);

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
      if (cleanupMap.has(el)) return;

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
        if (pressed) el.classList.add('is-pressed');
        else el.classList.remove('is-pressed');
      };

      const onDown = (e: MouseEvent | TouchEvent) => {
        if (e.type === 'touchstart' && 'touches' in e && e.touches.length > 0) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          isScrolling = false;
          hasMoved = false;
          pressTimeout = window.setTimeout(() => {
            if (!isScrolling && !hasMoved) setPressed(true);
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
          if (Math.max(deltaX, deltaY) > SCROLL_THRESHOLD) {
            hasMoved = true;
            isScrolling = true;
            setPressed(false);
            if (pressTimeout) {
              clearTimeout(pressTimeout);
              pressTimeout = null;
            }
          } else if (!isScrolling && pressed) {
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

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList.contains('cover-target')) attachPressHandlers(node);
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
      cleanupMap.forEach((c) => c());
      cleanupMap.clear();
    };
  }, [currentTab, selectedCategories, showAll, role, progress]);

  // Create a Map for O(1) word lookups by ID
  const wordIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    words.forEach((word, index) => {
      map.set(word.id, index);
    });
    return map;
  }, [words]);

  const handleWordFieldChange = useCallback((wordId: string, field: keyof Word, value: string | string[]) => {
    const index = wordIndexMap.get(wordId);
    if (index === undefined) return;
    setWords((prevWords) => {
      const updated = [...prevWords];
      const word = { ...updated[index] };
      (word as any)[field] = value;
      updated[index] = word;
      return updated;
    });
  }, [wordIndexMap]);

  const handleCategoryAdd = useCallback((wordId: string, category: string) => {
    const index = wordIndexMap.get(wordId);
    if (index === undefined) return;
    setWords((prevWords) => {
      const updated = [...prevWords];
      const word = { ...updated[index] };
      const categories = [...(word.category || [])];
      if (!categories.includes(category)) {
        categories.push(category);
        word.category = categories;
        updated[index] = word;
      }
      return updated;
    });
  }, [wordIndexMap]);

  const handleCategoryRemove = useCallback((wordId: string, category: string) => {
    const index = wordIndexMap.get(wordId);
    if (index === undefined) return;
    setWords((prevWords) => {
      const updated = [...prevWords];
      const word = { ...updated[index] };
      const categories = [...(word.category || [])];
      const indexOf = categories.indexOf(category);
      if (indexOf >= 0) {
        categories.splice(indexOf, 1);
        word.category = categories;
        updated[index] = word;
      }
      return updated;
    });
  }, [wordIndexMap]);

  const handleCategoryToggle = useCallback((wordId: string, category: string) => {
    const index = wordIndexMap.get(wordId);
    if (index === undefined) return;
    setWords((prevWords) => {
      const updated = [...prevWords];
      const word = { ...updated[index] };
      const categories = [...(word.category || [])];
      const indexOf = categories.indexOf(category);
      if (indexOf >= 0) {
        categories.splice(indexOf, 1);
      } else {
        categories.push(category);
      }
      word.category = categories;
      updated[index] = word;
      return updated;
    });
  }, [wordIndexMap]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId(),
        },
        body: JSON.stringify({ words }),
      });

      const data = await response.json();
      if (data.success) {
        setSaveMessage('Saved successfully!');
        // Keep editing mode - don't redirect
        setTimeout(() => {
          setSaveMessage(null);
        }, 2000);
      } else {
        setSaveMessage(`Error: ${data.error || 'Failed to save'}`);
      }
    } catch (error) {
      setSaveMessage(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`);
    } finally {
      setIsSaving(false);
    }
  };

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

  // Calculate readyCount from all words (with category filters) before tab filtering
  const readyCount = useMemo(() => {
    const categoryFiltered = normalizedWords.filter((word) => 
      matchesCategoryFilter(word, selectedCategories)
    );
    let count = 0;
    categoryFiltered.forEach((word) => {
      const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      if (isDue(prog)) {
        count += 1;
      }
    });
    return count;
  }, [normalizedWords, selectedCategories, progress]);

  // Group words by stage (memoized for performance) - must be before early return
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

  const statsWords = useMemo(() => {
    return getProgressStatsWords(normalizedWords, selectedCategories);
  }, [normalizedWords, selectedCategories]);

  // Memoized card renderer for EditableWordCard (accepts stageIndex for VirtualizedWordList)
  const renderEditableCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    const prog = progress[word.id] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    return (
      <div key={word.id} className="pt-1">
        <EditableWordCard
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
          onWordChange={(wordId, field, value) => handleWordFieldChange(wordId, field, value)}
          onCategoryToggle={(cat) => handleCategoryToggle(word.id, cat)}
          onCategoryAdd={(cat) => handleCategoryAdd(word.id, cat)}
          onCategoryRemove={(cat) => handleCategoryRemove(word.id, cat)}
          showEnglish={showEnglish}
          showCategoryBadges={showCategoryBadges}
        />
      </div>
    );
  }, [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, handleWordFieldChange, handleCategoryToggle, handleCategoryAdd, handleCategoryRemove, showEnglish, showCategoryBadges]);

  if (isLoading || !isHydrated) {
    return (
      <div className="app">
        <div className="p-8 text-center">Loading...</div>
      </div>
    );
  }

  // Prevent rendering edit UI for non-editors (avoids flash before router.replace completes)
  if (isRedirecting || userRole !== 'editor') {
    return (
      <div className="app">
        <div className="p-8 text-center">Redirecting...</div>
      </div>
    );
  }

  // Calculate progress stats
  const progressStats = calculateProgressStats(statsWords, progress, readyCount);

  const editHeader = (
    <div className="py-3 border-b border-border-subtle bg-background-elevated">
      <div className="app-content-column flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-accent font-semibold">✏️ EDIT MODE</span>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Error') ? 'text-danger' : 'text-accent'}`}>
              {saveMessage}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/')}
            className="py-1.5 px-3 rounded-full border border-border-subtle bg-transparent text-text cursor-pointer text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`py-1.5 px-3 rounded-full border-none bg-accent text-background text-xs font-medium ${isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

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
      categories={categories}
      selectedCategories={selectedCategories}
      onToggleCategory={toggleCategoryFilter}
      progressStats={progressStats}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      progressOpen={progressOpen}
      setProgressOpen={setProgressOpen}
      categoryOpen={categoryOpen}
      setCategoryOpen={setCategoryOpen}
      memoryHooksOpen={memoryHooksOpen}
      setMemoryHooksOpen={setMemoryHooksOpen}
      header={editHeader}
    >

      <main
        className="block flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden"
        ref={phrasesCallbackRef}
        aria-live="polite"
      >
        <div className="app-content-column flex flex-col gap-[18px] flex-1 min-h-0">
          {filteredWords.length === 0 ? (
            <div className="p-8 text-center text-text-soft">
              {currentTab === 'ready' ? 'All caught up!' : 'No words match your current filters.'}
            </div>
          ) : currentTab === 'ready' ? (
            <VirtualizedWordList
              key="ready"
              dataTab="ready"
              groupedWords={groupedWords}
              renderCard={renderEditableCard}
              emptyMessage="All caught up! No words ready for review."
              scrollElement={phrasesScrollElement}
            />
          ) : (
            <>
              <VirtualizedWordList
                key="all"
                dataTab="all"
                groupedWords={groupedWordsForAll}
                renderCard={renderEditableCard}
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
                            {items.map((word) => renderEditableCard(word, stageIndex))}
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
