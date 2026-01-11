// Main app state hook
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadProgress, saveProgress, loadRole, saveRole, loadMemoryHooks, saveMemoryHooks, loadCategoryFilter, saveCategoryFilter, loadShowEnglish, saveShowEnglish, loadShowCategoryBadges, saveShowCategoryBadges, hasMigratedToIds, markMigrationComplete, generateOldHashId, ProgressData } from '@/lib/storage';
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
  const [progress, setProgress] = useState<Record<string, ProgressData>>({});
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [showEnglish, setShowEnglish] = useState(true);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [memoryHooksOpen, setMemoryHooksOpen] = useState(false);
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastMovedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  // Load from localStorage after hydration (only once)
  // Create mappings for migrating old data to new word IDs
  useEffect(() => {
    // Only load once, and only when we have words
    if (hasLoadedRef.current || words.length === 0) {
      console.log('[useAppState] Skipping load, hasLoaded:', hasLoadedRef.current, 'words.length:', words.length);
      return;
    }
    hasLoadedRef.current = true;
    console.log('[useAppState] Loading with', words.length, 'words');
    
    // Build mappings for migration:
    // 1. Old numeric index -> new ID (for very old data)
    // 2. Old hash ID -> new ID (for hash-based data like "ffkl5c" -> "w000")
    const indexToIdMap = new Map<number, string>();
    const hashToIdMap = new Map<string, string>();
    
    words.forEach((word) => {
      // Map from old numeric index (extracted from new ID like "w095" -> 95)
      const originalIndex = parseInt(word.id.substring(1), 10);
      if (!isNaN(originalIndex)) {
        indexToIdMap.set(originalIndex, word.id);
      }
      
      // Map from old hash ID to new ID
      const oldHash = generateOldHashId(word.cz, word.vi, word.en);
      hashToIdMap.set(oldHash, word.id);
    });
    
    // Check if migration is needed before loading either
    const needsMigration = !hasMigratedToIds();
    
    setRole(loadRole());
    // Pass both maps for migration
    setProgress(loadProgress(indexToIdMap, hashToIdMap, needsMigration));
    setMemoryHooks(loadMemoryHooks(indexToIdMap, hashToIdMap, needsMigration));
    setSelectedCategories(loadCategoryFilter());
    setShowEnglish(loadShowEnglish());
    setShowCategoryBadges(loadShowCategoryBadges());
    
    // Mark migration complete after both progress and hooks are migrated
    if (needsMigration) {
      markMigrationComplete();
    }
    
    setIsHydrated(true);
  }, [words]);

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

  useEffect(() => {
    if (!isHydrated) return;
    saveShowEnglish(showEnglish);
  }, [showEnglish, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveShowCategoryBadges(showCategoryBadges);
  }, [showCategoryBadges, isHydrated]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (lastMovedTimeoutRef.current) {
        clearTimeout(lastMovedTimeoutRef.current);
      }
    };
  }, []);

  // Update progress for a word by its stable ID
  const updateProgress = useCallback((wordId: string, updates: Partial<ProgressData>) => {
    setProgress((prev) => {
      const current = prev[wordId] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      return {
        ...prev,
        [wordId]: { ...current, ...updates },
      };
    });
  }, []);

  // Mark word as known by its stable ID
  const markKnown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      const newStageIndex = Math.min(current.stageIndex + 1, STAGES.length - 1);
      const stage = STAGES[newStageIndex];
      return {
        ...prev,
        [wordId]: {
          ...current,
          stageIndex: newStageIndex,
          knownCount: current.knownCount + 1,
          lastKnownAt: Date.now(),
          nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
        },
      };
    });
    setLastMovedId(wordId);
    // Clear any existing timeout before setting a new one
    if (lastMovedTimeoutRef.current) {
      clearTimeout(lastMovedTimeoutRef.current);
    }
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedId(null), 1000);
  }, []);

  // Mark word as really known (skips one stage) by its stable ID
  const markReallyKnown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      // Advance by 2 stages instead of 1 to skip one time frame
      const newStageIndex = Math.min(current.stageIndex + 2, STAGES.length - 1);
      const stage = STAGES[newStageIndex];
      return {
        ...prev,
        [wordId]: {
          ...current,
          stageIndex: newStageIndex,
          knownCount: current.knownCount + 1,
          lastKnownAt: Date.now(),
          nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
        },
      };
    });
    setLastMovedId(wordId);
    // Clear any existing timeout before setting a new one
    if (lastMovedTimeoutRef.current) {
      clearTimeout(lastMovedTimeoutRef.current);
    }
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedId(null), 1000);
  }, []);

  // Mark word as unknown by its stable ID
  const markUnknown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      const prevStage = Math.max(current.stageIndex - 1, 0);
      const stage = STAGES[prevStage];
      return {
        ...prev,
        [wordId]: {
          ...current,
          stageIndex: prevStage,
          unknownCount: current.unknownCount + 1,
          lastUnknownAt: Date.now(),
          nextDueAt: stage.intervalMs > 0 ? Date.now() + stage.intervalMs : undefined,
        },
      };
    });
    setLastMovedId(wordId);
    // Clear any existing timeout before setting a new one
    if (lastMovedTimeoutRef.current) {
      clearTimeout(lastMovedTimeoutRef.current);
    }
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedId(null), 1000);
  }, []);

  // Get filtered words based on current tab and filters
  const getFilteredWords = useCallback(() => {
    let filtered = words
      .filter((word) => matchesCategoryFilter(word, selectedCategories));

    if (currentTab === 'ready' && isHydrated) {
      filtered = filtered.filter((word) => {
        const prog = progress[word.id];
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

  // Get memory hook for a word by its stable ID
  const getMemoryHook = useCallback((wordId: string) => {
    return memoryHooks[wordId] || '';
  }, [memoryHooks]);

  // Set memory hook for a word by its stable ID
  const setMemoryHook = useCallback((wordId: string, hook: string) => {
    setMemoryHooks((prev) => {
      const next = { ...prev };
      if (hook.trim()) {
        next[wordId] = hook.trim();
      } else {
        delete next[wordId];
      }
      return next;
    });
  }, []);

  // Get suggested memory hook for a word
  const getSuggestedMemoryHook = useCallback((word: NormalizedWord) => {
    if (!word) return '';
    if (role === 'vi') return word.viHint || '';
    if (role === 'cz') return word.czHint || '';
    return '';
  }, [role]);

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
    updateProgress,
    markKnown,
    markReallyKnown,
    markUnknown,
    getFilteredWords,
    toggleCategory,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    isHydrated,
  };
}

