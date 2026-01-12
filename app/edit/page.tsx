'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WORDS } from '@/data/words';
import { Word } from '@/data/words';
import { normalizeWords, getAllCategoriesWithCounts, STAGES, isDue, NormalizedWord } from '@/lib/words';
import { useAppState } from '@/hooks/useAppState';
import { TopMenu } from '@/components/TopMenu';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CategoryPanel } from '@/components/CategoryPanel';
import { MemoryHooksPanel } from '@/components/MemoryHooksPanel';
import { EditableWordCard, EDIT_ONLY_CATEGORIES } from '@/components/EditableWordCard';
import { useDueTimer } from '@/hooks/useDueTimer';

const PAGE_STYLES = `
  .toggle-button-container-large {
    padding: 1.5rem;
    text-align: center;
    border-top: 1px solid var(--border-subtle);
    margin-top: 1rem;
  }

  .toggle-button {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 0.75rem 1.5rem;
    font-size: 0.9rem;
    color: var(--text);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-weight: 500;
    font-family: var(--font-sans);
  }

  .toggle-button:hover {
    background: rgba(15, 23, 42, 1);
  }

  .toggle-button-secondary {
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    color: var(--text-soft);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: var(--font-sans);
  }

  .toggle-button-secondary:hover {
    background: rgba(15, 23, 42, 0.9);
    color: var(--text);
  }

  .waiting-for-repeat-header {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-subtle);
    margin-top: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-elevated);
  }

  .waiting-for-repeat-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-soft);
  }
`;

function PageStyles() {
  return <style>{PAGE_STYLES}</style>;
}

export default function EditPage() {
  const router = useRouter();
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Use normalized words for app state (for filtering, etc.)
  const normalizedWords = words.length > 0 ? normalizeWords(words as Word[]) : [];
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
    getFilteredWords,
    toggleCategory: toggleCategoryFilter,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    isHydrated,
  } = useAppState(normalizedWords);

  const filteredWords = getFilteredWords();
  // In edit mode, always show all categories with counts from all words (not filtered)
  // Include edit-only categories (like "to fix") even if they have 0 occurrences
  const categories = useMemo(() => {
    return getAllCategoriesWithCounts(normalizedWords, normalizedWords, EDIT_ONLY_CATEGORIES);
  }, [normalizedWords]);
  const phrasesRef = useRef<HTMLElement>(null);
  const [showWaitingForRepeat, setShowWaitingForRepeat] = useState(false);

  // Trigger re-render when cards become due for review
  useDueTimer(progress);

  useEffect(() => {
    // Start with normalized WORDS from data/words as default
    const defaultWords = WORDS.map((w) => {
      return { ...w, category: [...w.category] };
    });
    setWords(defaultWords as Word[]);
    setIsLoading(false);

    // Try to load from API in the background
    fetch('/api/words')
      .then((res) => res.json())
      .then((data) => {
        if (data.words && Array.isArray(data.words) && data.words.length > 0) {
          setWords(data.words);
        }
      })
      .catch((err) => {
        console.log('API load failed, using default words:', err);
      });
  }, []);

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
  }, [currentTab, selectedCategories, showAll, modeIndex, role, progress]);

  // Helper to find raw word index from word ID
  const findRawWordIndex = (wordId: string): number => {
    return normalizedWords.findIndex(w => w.id === wordId);
  };

  const handleWordFieldChange = (wordId: string, field: keyof Word, value: string | string[]) => {
    const index = findRawWordIndex(wordId);
    if (index < 0) return;
    setWords((prevWords) => {
      const updated = [...prevWords];
      const word = { ...updated[index] };
      (word as any)[field] = value;
      updated[index] = word;
      return updated;
    });
  };

  const handleCategoryAdd = (wordId: string, category: string) => {
    const index = findRawWordIndex(wordId);
    if (index < 0) return;
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
  };

  const handleCategoryRemove = (wordId: string, category: string) => {
    const index = findRawWordIndex(wordId);
    if (index < 0) return;
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
  };

  const handleCategoryToggle = (wordId: string, category: string) => {
    const index = findRawWordIndex(wordId);
    if (index < 0) return;
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
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Reset showWaitingForRepeat when switching tabs or filters change
  useEffect(() => {
    setShowWaitingForRepeat(false);
  }, [currentTab, selectedCategories]);

  const closeAllPanels = () => {
    setSettingsOpen(false);
    setProgressOpen(false);
    setCategoryOpen(false);
    setMemoryHooksOpen(false);
  };

  // Group words by stage (memoized for performance) - must be before early return
  const { groupedWords, groupedWordsWaiting, readyCount } = useMemo(() => {
    const grouped = STAGES.map(() => [] as NormalizedWord[]);
    const groupedWaiting = STAGES.map(() => [] as NormalizedWord[]);
    let ready = 0;

    filteredWords.forEach((word) => {
      const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      const due = isDue(prog);
      if (due) ready += 1;
      if (currentTab === 'ready' && !due) return;
      const sIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));

      if (currentTab === 'all' && due) {
        groupedWaiting[sIdx].push(word);
      } else {
        grouped[sIdx].push(word);
      }
    });

    return { groupedWords: grouped, groupedWordsWaiting: groupedWaiting, readyCount: ready };
  }, [filteredWords, progress, currentTab]);

  // Memoized card renderer for EditableWordCard - must be before early return
  const renderEditableCard = useCallback((word: NormalizedWord) => {
    const prog = progress[word.id] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    return (
      <EditableWordCard
        key={word.id}
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
        onWordChange={(wordId, field, value) => handleWordFieldChange(wordId, field, value)}
        onCategoryToggle={(cat) => handleCategoryToggle(word.id, cat)}
        onCategoryAdd={(cat) => handleCategoryAdd(word.id, cat)}
        onCategoryRemove={(cat) => handleCategoryRemove(word.id, cat)}
        showEnglish={showEnglish}
        showCategoryBadges={showCategoryBadges}
      />
    );
  }, [progress, role, modeIndex, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, handleWordFieldChange, handleCategoryToggle, handleCategoryAdd, handleCategoryRemove, showEnglish, showCategoryBadges]);

  if (isLoading || !isHydrated) {
    return (
      <div className="app">
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  // Calculate progress stats
  const calculateProgressStats = () => {
    const stats = {
      total: filteredWords.length,
      byStage: STAGES.map(() => 0),
      totalKnown: 0,
      totalUnknown: 0,
      readyCount: readyCount,
      fresh: 0,
      learning: 0,
      done: 0,
      new: 0,
    };

    filteredWords.forEach((word) => {
      const prog = progress[word.id] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      const stageIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
      
      stats.byStage[stageIdx] += 1;
      stats.totalKnown += prog.knownCount || 0;
      stats.totalUnknown += prog.unknownCount || 0;
      
      if (stageIdx === 0) {
        stats.new += 1;
      } else if (stageIdx >= 1 && stageIdx <= 5) {
        stats.fresh += 1;
      } else if (stageIdx >= 6 && stageIdx <= 8) {
        stats.learning += 1;
      } else if (stageIdx >= 9) {
        stats.done += 1;
      }
    });

    return stats;
  };

  const progressStats = calculateProgressStats();
  const progressPercent = progressStats.total > 0 
    ? Math.round((progressStats.fresh + progressStats.learning + progressStats.done) / progressStats.total * 100) 
    : 0;
  const totalAnswers = progressStats.totalKnown + progressStats.totalUnknown;
  const accuracy = totalAnswers > 0 
    ? Math.round((progressStats.totalKnown / totalAnswers) * 100) 
    : 0;

  return (
    <div className="app">
      {/* Edit mode header */}
      <div style={{ 
        padding: '0.75rem 1rem', 
        borderBottom: '1px solid var(--border-subtle)', 
        background: 'var(--bg-elevated)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--accent)', fontWeight: 600 }}>✏️ EDIT MODE</span>
          {saveMessage && (
            <span style={{ color: saveMessage.includes('Error') ? 'var(--danger)' : 'var(--accent)', fontSize: '0.875rem' }}>
              {saveMessage}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--bg)',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

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

      <SettingsPanel 
        role={role} 
        onRoleChange={setRole}
        showEnglish={showEnglish}
        onShowEnglishChange={setShowEnglish}
        showCategoryBadges={showCategoryBadges}
        onShowCategoryBadgesChange={setShowCategoryBadges}
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)}
      />

      <CategoryPanel
        isOpen={categoryOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategoryFilter}
        onClose={() => setCategoryOpen(false)}
      />

      <MemoryHooksPanel 
        isOpen={memoryHooksOpen} 
        onClose={() => setMemoryHooksOpen(false)}
      />

      <section
        className={`progress-panel ${progressOpen ? 'is-open' : ''}`}
        aria-label="Progress"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="progress-panel-inner" id="progress-panel-content">
          <div className="progress-overview">
            <div className="progress-header" style={{ position: 'relative' }}>
              <h1>📊 Learning Progress</h1>
              <button
                onClick={() => setProgressOpen(false)}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  color: 'var(--text-soft)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-soft)';
                }}
                aria-label="Close progress"
              >
                ×
              </button>
            </div>

            <div className="progress-stats-grid">
              <div className="progress-stat-card">
                <div className="progress-stat-value">{progressStats.total}</div>
                <div className="progress-stat-label">Total Words</div>
              </div>
              <div className="progress-stat-card">
                <div className="progress-stat-value">{progressPercent}%</div>
                <div className="progress-stat-label">Progress</div>
                <div className="progress-stat-subtitle">
                  {progressStats.fresh + progressStats.learning + progressStats.done} / {progressStats.total}
                </div>
              </div>
              <div className="progress-stat-card">
                <div className="progress-stat-value">{progressStats.readyCount}</div>
                <div className="progress-stat-label">Ready Now</div>
              </div>
              <div className="progress-stat-card">
                <div className="progress-stat-value">{progressStats.done}</div>
                <div className="progress-stat-label">Done</div>
                <div className="progress-stat-subtitle">Stage 9-10</div>
              </div>
            </div>

            <div className="progress-section">
              <h2>Learning Status</h2>
              <div className="progress-status-grid">
                <div className="progress-status-card new">
                  <div className="progress-status-value">{progressStats.new}</div>
                  <div className="progress-status-label">New / Not Started</div>
                </div>
                <div className="progress-status-card fresh">
                  <div className="progress-status-value">{progressStats.fresh}</div>
                  <div className="progress-status-label">Fresh</div>
                </div>
                <div className="progress-status-card learning">
                  <div className="progress-status-value">{progressStats.learning}</div>
                  <div className="progress-status-label">Learning</div>
                </div>
                <div className="progress-status-card done">
                  <div className="progress-status-value">{progressStats.done}</div>
                  <div className="progress-status-label">Done</div>
                </div>
              </div>
            </div>

            <div className="progress-section">
              <h2>Words by Stage</h2>
              <div className="progress-stage-list">
                {STAGES.map((stage, index) => {
                  const count = progressStats.byStage[index];
                  if (count === 0 && index > 0) return null;
                  
                  const barPercent = progressStats.total > 0 ? (count / progressStats.total * 100) : 0;
                  
                  return (
                    <div
                      key={index}
                      className={`progress-stage-item ${index === 0 ? 'stage-new' : ''} ${index >= 7 ? 'stage-mastered' : ''}`}
                    >
                      <div className="progress-stage-name">{stage.name}</div>
                      <div className="progress-stage-count">{count}</div>
                      <div className="progress-stage-bar">
                        <div
                          className="progress-stage-bar-fill"
                          style={{ width: `${barPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="progress-section">
              <h2>Answer Statistics</h2>
              <div className="progress-answer-stats">
                <div className="progress-answer-item">
                  <div className="progress-answer-label">Correct</div>
                  <div className="progress-answer-value correct">{progressStats.totalKnown}</div>
                </div>
                <div className="progress-answer-item">
                  <div className="progress-answer-label">Incorrect</div>
                  <div className="progress-answer-value incorrect">{progressStats.totalUnknown}</div>
                </div>
                <div className="progress-answer-item">
                  <div className="progress-answer-label">Accuracy</div>
                  <div className="progress-answer-value">{accuracy}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {progressStats.total > 0 && (
        <div className="progress-summary">
          <span className="progress-summary-item fresh">
            <span className="progress-summary-label">fresh</span>
            <span className="progress-summary-value">({progressStats.fresh})</span>
          </span>
          <span className="progress-summary-item learning">
            <span className="progress-summary-label">learning</span>
            <span className="progress-summary-value">({progressStats.learning})</span>
          </span>
          <span className="progress-summary-item done">
            <span className="progress-summary-label">done</span>
            <span className="progress-summary-value">({progressStats.done})</span>
          </span>
        </div>
      )}

      <main className="phrases" ref={phrasesRef} aria-live="polite">
        {filteredWords.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-soft)' }}>
            {currentTab === 'ready' ? 'All caught up!' : 'No words match your current filters.'}
          </div>
        ) : (
          <>
            {/* Regular words (not waiting for repeat) */}
            {STAGES.map((stage, stageIndex) => {
              const items = groupedWords[stageIndex];
              if (!items.length) return null;

              return (
                <section key={stageIndex} className="category-zone">
                  <h2 className="category-zone-title">{stage.name}</h2>
                  {items.map(renderEditableCard)}
                </section>
              );
            })}
            
            {/* Words waiting for repeat - hidden by default in "all" tab */}
            {currentTab === 'all' && readyCount > 0 && (
              <>
                {!showWaitingForRepeat && (
                  <div className="toggle-button-container-large">
                    <button
                      type="button"
                      className="toggle-button"
                      onClick={() => setShowWaitingForRepeat(true)}
                    >
                      Show {readyCount} word{readyCount !== 1 ? 's' : ''} waiting for repeat
                    </button>
                  </div>
                )}
                {showWaitingForRepeat && (
                  <>
                    <div className="waiting-for-repeat-header">
                      <h2 className="waiting-for-repeat-title">
                        Waiting for repeat ({readyCount})
                      </h2>
                      <button
                        type="button"
                        className="toggle-button-secondary"
                        onClick={() => setShowWaitingForRepeat(false)}
                      >
                        Hide
                      </button>
                    </div>
                    {STAGES.map((stage, stageIndex) => {
                      const items = groupedWordsWaiting[stageIndex];
                      if (!items.length) return null;

                      return (
                        <section key={`waiting-${stageIndex}`} className="category-zone">
                          <h2 className="category-zone-title">{stage.name}</h2>
                          {items.map(renderEditableCard)}
                        </section>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
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
          data-tab="ready"
          data-count={readyCount > 0 ? readyCount : ''}
        >
          Ready to repeat
        </button>
      </nav>
      <PageStyles />
    </div>
  );
}
