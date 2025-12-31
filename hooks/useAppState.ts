// Main app state hook
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadProgress, saveProgress, loadRole, saveRole, loadMemoryHooks, saveMemoryHooks, loadCategoryFilter, saveCategoryFilter, ProgressData } from '@/lib/storage';
import { NormalizedWord, STAGES, isDue, matchesCategoryFilter } from '@/lib/words';

export type Role = 'cz' | 'vi';
export type Tab = 'all' | 'ready';

export function useAppState(words: NormalizedWord[]) {
  // Initialize with defaults that match server-side rendering
  // Update from localStorage after hydration to avoid mismatches
  const [role, setRole] = useState<Role>('vi');
  const [modeIndex, setModeIndex] = useState(0); // 0 or 1 depending on role
  const [showAll, setShowAll] = useState(false);
  const [currentTab, setCurrentTab] = useState<Tab>('all');
  const [progress, setProgress] = useState<Record<number, ProgressData>>({});
  const [memoryHooks, setMemoryHooks] = useState<Record<number, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [memoryHooksOpen, setMemoryHooksOpen] = useState(false);
  const [lastMovedIndex, setLastMovedIndex] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastMovedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage after hydration
  useEffect(() => {
    setRole(loadRole());
    setProgress(loadProgress());
    setMemoryHooks(loadMemoryHooks());
    setSelectedCategories(loadCategoryFilter());
    setIsHydrated(true);
  }, []);

  // Save to localStorage when state changes (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    saveProgress(progress);
  }, [progress, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveRole(role);
  }, [role, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveMemoryHooks(memoryHooks);
  }, [memoryHooks, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveCategoryFilter(selectedCategories);
  }, [selectedCategories, isHydrated]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (lastMovedTimeoutRef.current) {
        clearTimeout(lastMovedTimeoutRef.current);
      }
    };
  }, []);

  // Update progress for a word
  const updateProgress = useCallback((wordIndex: number, updates: Partial<ProgressData>) => {
    setProgress((prev) => {
      const current = prev[wordIndex] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      return {
        ...prev,
        [wordIndex]: { ...current, ...updates },
      };
    });
  }, []);

  // Mark word as known
  const markKnown = useCallback((wordIndex: number) => {
    setProgress((prev) => {
      const current = prev[wordIndex] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      const newStageIndex = Math.min(current.stageIndex + 1, STAGES.length - 1);
      const stage = STAGES[newStageIndex];
      return {
        ...prev,
        [wordIndex]: {
          ...current,
          stageIndex: newStageIndex,
          knownCount: current.knownCount + 1,
          lastKnownAt: Date.now(),
          nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
        },
      };
    });
    setLastMovedIndex(wordIndex);
    // Clear any existing timeout before setting a new one
    if (lastMovedTimeoutRef.current) {
      clearTimeout(lastMovedTimeoutRef.current);
    }
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedIndex(null), 1000);
  }, []);

  // Mark word as unknown
  const markUnknown = useCallback((wordIndex: number) => {
    setProgress((prev) => {
      const current = prev[wordIndex] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      const prevStage = Math.max(current.stageIndex - 1, 0);
      const stage = STAGES[prevStage];
      return {
        ...prev,
        [wordIndex]: {
          ...current,
          stageIndex: prevStage,
          unknownCount: current.unknownCount + 1,
          lastUnknownAt: Date.now(),
          nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
        },
      };
    });
    setLastMovedIndex(wordIndex);
    // Clear any existing timeout before setting a new one
    if (lastMovedTimeoutRef.current) {
      clearTimeout(lastMovedTimeoutRef.current);
    }
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedIndex(null), 1000);
  }, []);

  // Get filtered words based on current tab and filters
  const getFilteredWords = useCallback(() => {
    let filtered = words.map((word, index) => ({ word, index }))
      .filter(({ word }) => matchesCategoryFilter(word, selectedCategories));

    if (currentTab === 'ready' && isHydrated) {
      filtered = filtered.filter(({ index }) => {
        const prog = progress[index];
        return prog && isDue(prog);
      });
    }

    return filtered;
  }, [words, selectedCategories, currentTab, progress, isHydrated]);

  // Toggle category filter
  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Get memory hook for a word
  const getMemoryHook = useCallback((index: number) => {
    return memoryHooks[index] || '';
  }, [memoryHooks]);

  // Set memory hook for a word
  const setMemoryHook = useCallback((index: number, hook: string) => {
    setMemoryHooks((prev) => {
      const next = { ...prev };
      if (hook.trim()) {
        next[index] = hook.trim();
      } else {
        delete next[index];
      }
      return next;
    });
  }, []);

  // Get suggested memory hook
  const getSuggestedMemoryHook = useCallback((index: number) => {
    const word = words[index];
    if (!word) return '';
    if (role === 'vi') return word.viHint || '';
    if (role === 'cz') return word.czHint || '';
    return '';
  }, [words, role]);

  // Handle role change
  const handleRoleChange = useCallback((newRole: 'cz' | 'vi') => {
    setRole(newRole);
    setModeIndex(0); // Reset mode index when role changes
  }, []);

  return {
    role,
    setRole: handleRoleChange,
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
    updateProgress,
    markKnown,
    markUnknown,
    getFilteredWords,
    toggleCategory,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedIndex,
    isHydrated,
  };
}

