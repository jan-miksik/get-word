'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Word } from '@/data/words';
import { getDeviceId } from '@/lib/device-id';
import { normalizeWords, getAllCategoriesWithCounts, STAGES, isDue, NormalizedWord, matchesCategoryFilter } from '@/lib/words';
import { useAppState } from '@/hooks/useAppState';
import { useWordsLoader } from '@/hooks/useWordsLoader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import { AppLayout } from '@/components/AppLayout';
import { BottomNav } from '@/components/BottomNav';
import { EditableWordCard, EDIT_ONLY_CATEGORIES } from '@/components/EditableWordCard';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/hooks/useAuth';
import type { MinigameFrequencyRange } from '@/lib/minigames';
import { DEFAULT_MINIGAME_FREQUENCY } from '@/lib/minigames';

export default function EditPage() {
  const router = useRouter();
  const { isConnected, email, address: walletAddress, signOut } = useAuth();
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
    progress,
    memoryHooks,
    selectedCategories,
    showEnglish,
    setShowEnglish,
    showCategoryBadges,
    setShowCategoryBadges,
    theme,
    setTheme,
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
    userEmail,
    userRole,
    isHydrated,
  } = useAppState(normalizedWords);

  const isAuthenticated = isConnected || !!(userWalletAddress || userEmail);
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
  // In edit mode, always show all categories with counts from all words (not filtered)
  // Include edit-only categories (like "to fix") even if they have 0 occurrences
  const categories = useMemo(() => {
    return getAllCategoriesWithCounts(normalizedWords, normalizedWords, EDIT_ONLY_CATEGORIES);
  }, [normalizedWords]);
  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);
  const [showWaitingForRepeat, setShowWaitingForRepeat] = useState(false);
  const [showNotReady, setShowNotReady] = useState(false);

  const [minigameFrequency, setMinigameFrequency] = useState<MinigameFrequencyRange>(() => {
    if (typeof window === 'undefined') return DEFAULT_MINIGAME_FREQUENCY;
    const stored = window.localStorage.getItem('wordlink-minigame-frequency');
    if (!stored || stored === 'off') return stored === 'off' ? 'off' : DEFAULT_MINIGAME_FREQUENCY;
    const legacy: Record<string, MinigameFrequencyRange> = {
      '2-5': { min: 2, max: 5 },
      '3-7': { min: 3, max: 7 },
      '5-10': { min: 5, max: 10 },
    };
    if (legacy[stored]) return legacy[stored];
    try {
      const parsed = JSON.parse(stored) as MinigameFrequencyRange;
      if (parsed === 'off' || (typeof parsed === 'object' && typeof parsed?.min === 'number' && typeof parsed?.max === 'number'))
        return parsed;
    } catch {
      // ignore
    }
    return DEFAULT_MINIGAME_FREQUENCY;
  });

  const phrasesCallbackRef = useCallback((node: HTMLElement | null) => {
    phrasesRef.current = node;
    setPhrasesScrollElement(node);
  }, []);

  // Trigger re-render when cards become due for review
  useDueTimer(progress);

  // Persist minigame frequency preference (same key as main page)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const toStore = minigameFrequency === 'off' ? 'off' : JSON.stringify(minigameFrequency);
    window.localStorage.setItem('wordlink-minigame-frequency', toStore);
  }, [minigameFrequency]);

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
  }, [selectedCategories, showAll, role, progress]);

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

  // Reset expandable sections when filters change
  useEffect(() => {
    setShowWaitingForRepeat(false);
    setShowNotReady(false);
  }, [selectedCategories]);

  // Split filteredWords into three buckets for single-stream ordering
  const { dueWords, newWords, settlingWords } = useMemo(() => {
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

    due.sort((a, b) => (progress[a.id]?.nextDueAt ?? 0) - (progress[b.id]?.nextDueAt ?? 0));

    return { dueWords: due, newWords: newW, settlingWords: settling };
  }, [filteredWords, progress]);

  const readyCount = dueWords.length;

  const streamGroupedWords = useMemo((): NormalizedWord[][] => {
    const groups: NormalizedWord[][] = STAGES.map(() => []);
    groups[0] = dueWords;
    groups[1] = newWords;
    if (showNotReady) {
      settlingWords.forEach((word) => {
        const sIdx = Math.max(2, Math.min(progress[word.id]?.stageIndex ?? 2, STAGES.length - 1));
        groups[sIdx].push(word);
      });
    }
    return groups;
  }, [dueWords, newWords, settlingWords, showNotReady, progress]);

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
    return <LoadingScreen />;
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
      showAll={showAll}
      onShowAll={() => setShowAll(!showAll)}
      selectedCategories={selectedCategories}
      role={role}
      onRoleChange={setRole}
      showEnglish={showEnglish}
      onShowEnglishChange={setShowEnglish}
      showCategoryBadges={showCategoryBadges}
      onShowCategoryBadgesChange={setShowCategoryBadges}
      theme={theme}
      onThemeChange={setTheme}
      viewMode="stream"
      onViewModeChange={() => {}}
      userId={userId}
      userWalletAddress={userWalletAddress}
      userEmail={userEmail}
      isAuthenticated={isAuthenticated}
      authEmail={displayEmail}
      authAddress={displayAddress}
      onSignOut={signOut}
      categories={categories}
      onToggleCategory={toggleCategoryFilter}
      progressStats={progressStats}
      minigameFrequency={minigameFrequency}
      onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
      header={editHeader}
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
              renderCard={renderEditableCard}
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
      </main>

      <BottomNav readyCount={readyCount} />
    </AppLayout>
  );
}
