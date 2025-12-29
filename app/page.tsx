'use client';

import { useEffect, useRef } from 'react';
import { WORDS } from '@/data/words';
import { useAppState } from '@/hooks/useAppState';
import { getAvailableCategories, STAGES, isDue } from '@/lib/words';
import { TopMenu } from '@/components/TopMenu';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CategoryPanel } from '@/components/CategoryPanel';
import { MemoryHooksPanel } from '@/components/MemoryHooksPanel';
import { WordCard } from '@/components/WordCard';

export default function Home() {
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
    settingsOpen,
    setSettingsOpen,
    progressOpen,
    setProgressOpen,
    categoryOpen,
    setCategoryOpen,
    memoryHooksOpen,
    setMemoryHooksOpen,
    markKnown,
    markUnknown,
    getFilteredWords,
    toggleCategory,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedIndex,
  } = useAppState(WORDS);

  const categories = getAvailableCategories(WORDS);
  const phrasesRef = useRef<HTMLElement>(null);

  // Close panels when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.settings-panel') &&
        !target.closest('.progress-panel') &&
        !target.closest('.category-panel') &&
        !target.closest('.memory-hooks-panel') &&
        !target.closest('.mode-btn')
      ) {
        setSettingsOpen(false);
        setProgressOpen(false);
        setCategoryOpen(false);
        setMemoryHooksOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [setSettingsOpen, setProgressOpen, setCategoryOpen, setMemoryHooksOpen]);

  // Attach press handlers to cover targets
  useEffect(() => {
    if (!phrasesRef.current) return;

    const attachPressHandlers = (el: HTMLElement) => {
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

          hasMoved = true;

          if (totalDelta > SCROLL_THRESHOLD) {
            isScrolling = true;
            setPressed(false);
            if (pressTimeout) {
              clearTimeout(pressTimeout);
              pressTimeout = null;
            }
            return;
          }

          if (pressTimeout && totalDelta > 2) {
            clearTimeout(pressTimeout);
            pressTimeout = null;
          }

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

      return () => {
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('touchstart', onDown);
        el.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('touchcancel', onUp);
        if (pressTimeout) clearTimeout(pressTimeout);
      };
    };

    const coverTargets = phrasesRef.current.querySelectorAll('.cover-target');
    const cleanup: (() => void)[] = [];
    coverTargets.forEach((el) => {
      const cleanupFn = attachPressHandlers(el as HTMLElement);
      if (cleanupFn) cleanup.push(cleanupFn);
    });

    return () => {
      cleanup.forEach((fn) => fn());
    };
  }, [currentTab, selectedCategories, progress, showAll, modeIndex, role]);

  // Group words by stage
  const groupedWords = STAGES.map(() => [] as Array<{ word: typeof WORDS[0]; index: number }>);
  let readyCount = 0;

  const filteredWords = getFilteredWords();

  filteredWords.forEach(({ word, index }) => {
    const prog = progress[index] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
    const due = isDue(prog);
    if (due) readyCount += 1;
    if (currentTab === 'ready' && !due) return;
    const sIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    groupedWords[sIdx].push({ word, index });
  });

  // Calculate progress summary
  const progressStats = {
    total: filteredWords.length,
    ready: readyCount,
  };

  const closeAllPanels = () => {
    setSettingsOpen(false);
    setProgressOpen(false);
    setCategoryOpen(false);
    setMemoryHooksOpen(false);
  };

  return (
    <div className="app">
      <TopMenu
        onSwitch={(e) => {
          e.stopPropagation();
          setModeIndex(modeIndex === 0 ? 1 : 0);
        }}
        onShowAll={(e) => {
          e.stopPropagation();
          setShowAll(!showAll);
        }}
        onCategory={(e) => {
          e.stopPropagation();
          const wasOpen = categoryOpen;
          closeAllPanels();
          if (!wasOpen) setCategoryOpen(true);
        }}
        onProgress={(e) => {
          e.stopPropagation();
          const wasOpen = progressOpen;
          closeAllPanels();
          if (!wasOpen) setProgressOpen(true);
        }}
        onMemoryHooks={(e) => {
          e.stopPropagation();
          const wasOpen = memoryHooksOpen;
          closeAllPanels();
          if (!wasOpen) setMemoryHooksOpen(true);
        }}
        onSettings={(e) => {
          e.stopPropagation();
          const wasOpen = settingsOpen;
          closeAllPanels();
          if (!wasOpen) setSettingsOpen(true);
        }}
        showAll={showAll}
        categoryCount={selectedCategories.size}
        categoryActive={selectedCategories.size > 0}
        progressActive={progressOpen}
      />

      <SettingsPanel role={role} onRoleChange={setRole} isOpen={settingsOpen} />

      <CategoryPanel
        isOpen={categoryOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategory}
      />

      <MemoryHooksPanel isOpen={memoryHooksOpen} />

      <section
        className={`progress-panel ${progressOpen ? 'is-open' : ''}`}
        aria-label="Progress"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="progress-panel-inner" id="progress-panel-content">
          <h2>📊 Learning Progress</h2>
          <div className="progress-stats-grid">
            <div className="progress-stat-card">
              <div className="progress-stat-value">{progressStats.total}</div>
              <div className="progress-stat-label">Total Words</div>
            </div>
            <div className="progress-stat-card">
              <div className="progress-stat-value">{progressStats.ready}</div>
              <div className="progress-stat-label">Ready to Review</div>
            </div>
          </div>
        </div>
      </section>

      {progressStats.total > 0 && (
        <div className="progress-summary">
          <span className="progress-summary-item">
            <span className="progress-summary-label">total</span>
            <span className="progress-summary-value">({progressStats.total})</span>
          </span>
          <span className="progress-summary-item">
            <span className="progress-summary-label">ready</span>
            <span className="progress-summary-value">({progressStats.ready})</span>
          </span>
        </div>
      )}

      <main className="phrases" ref={phrasesRef} aria-live="polite">
        {filteredWords.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-soft)' }}>
            No words match your current filters.
          </div>
        ) : (
          STAGES.map((stage, stageIndex) => {
            const items = groupedWords[stageIndex];
            if (!items.length) return null;

            return (
              <section key={stageIndex} className="category-zone">
                <h2 className="category-zone-title">{stage.name}</h2>
                {items.map(({ word, index }) => {
                  const prog = progress[index] || {
                    stageIndex: 0,
                    knownCount: 0,
                    unknownCount: 0,
                  };
                  return (
                    <WordCard
                      key={index}
                      word={word}
                      index={index}
                      progress={prog}
                      role={role}
                      modeIndex={modeIndex}
                      showAll={showAll}
                      memoryHook={getMemoryHook(index)}
                      suggestedHook={getSuggestedMemoryHook(index)}
                      onKnown={() => markKnown(index)}
                      onUnknown={() => markUnknown(index)}
                      onMemoryHookChange={(hook) => setMemoryHook(index, hook)}
                      isMoved={lastMovedIndex === index}
                    />
                  );
                })}
              </section>
            );
          })
        )}
      </main>

      <nav className="bottom-nav" aria-label="View selection">
        <button
          className={`bottom-nav-btn ${currentTab === 'all' ? 'is-active' : ''}`}
          onClick={() => setCurrentTab('all')}
          type="button"
        >
          All words
        </button>
        <button
          className={`bottom-nav-btn ${currentTab === 'ready' ? 'is-active' : ''}`}
          onClick={() => setCurrentTab('ready')}
          type="button"
          data-count={readyCount > 0 ? readyCount : ''}
        >
          Ready to repeat
        </button>
      </nav>

      <footer className="app-footer">
        <p className="hint">
          💡 <strong>Tip:</strong> In hidden modes, press and hold on a word to see it. Release to
          hide again.
        </p>
      </footer>
    </div>
  );
}
