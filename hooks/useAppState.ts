// Main app state hook
'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadProgress, saveProgress, loadRole, saveRole, loadMemoryHooks, saveMemoryHooks, loadCategoryFilter, saveCategoryFilter, ProgressData } from '@/lib/storage';
import { NormalizedWord, STAGES, isDue, matchesCategoryFilter } from '@/lib/words';

export type Role = 'cz' | 'vi';
export type Tab = 'all' | 'ready';

export function useAppState(words: NormalizedWord[]) {
  const [role, setRole] = useState<Role>(loadRole());
  const [modeIndex, setModeIndex] = useState(0); // 0 or 1 depending on role
  const [showAll, setShowAll] = useState(false);
  const [currentTab, setCurrentTab] = useState<Tab>('all');
  const [progress, setProgress] = useState<Record<number, ProgressData>>(loadProgress());
  const [memoryHooks, setMemoryHooks] = useState<Record<number, string>>(loadMemoryHooks());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(loadCategoryFilter());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [memoryHooksOpen, setMemoryHooksOpen] = useState(false);
  const [lastMovedIndex, setLastMovedIndex] = useState<number | null>(null);

  // Save to localStorage when state changes
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    saveRole(role);
  }, [role]);

  useEffect(() => {
    saveMemoryHooks(memoryHooks);
  }, [memoryHooks]);

  useEffect(() => {
    saveCategoryFilter(selectedCategories);
  }, [selectedCategories]);

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
    const current = progress[wordIndex] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    const newStageIndex = Math.min(current.stageIndex + 1, STAGES.length - 1);
    const stage = STAGES[newStageIndex];
    updateProgress(wordIndex, {
      stageIndex: newStageIndex,
      knownCount: current.knownCount + 1,
      lastKnownAt: Date.now(),
      nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
    });
    setLastMovedIndex(wordIndex);
    setTimeout(() => setLastMovedIndex(null), 1000);
  }, [progress, updateProgress]);

  // Mark word as unknown
  const markUnknown = useCallback((wordIndex: number) => {
    const current = progress[wordIndex] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    const prevStage = Math.max(current.stageIndex - 1, 0);
    const stage = STAGES[prevStage];
    updateProgress(wordIndex, {
      stageIndex: prevStage,
      unknownCount: current.unknownCount + 1,
      lastUnknownAt: Date.now(),
      nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
    });
    setLastMovedIndex(wordIndex);
    setTimeout(() => setLastMovedIndex(null), 1000);
  }, [progress, updateProgress]);

  // Get filtered words based on current tab and filters
  const getFilteredWords = useCallback(() => {
    let filtered = words.map((word, index) => ({ word, index }))
      .filter(({ word }) => matchesCategoryFilter(word, selectedCategories));

    if (currentTab === 'ready') {
      filtered = filtered.filter(({ index }) => {
        const prog = progress[index];
        return prog && isDue(prog);
      });
    }

    return filtered;
  }, [words, selectedCategories, currentTab, progress]);

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
  };
}

