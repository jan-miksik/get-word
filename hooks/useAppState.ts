// Main app state hook
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ProgressData, SyncResponse } from '@/lib/sync';
import { NormalizedWord, STAGES, matchesCategoryFilter } from '@/lib/words';
import { fetchUserData, debouncedSync, linkWallet } from '@/lib/sync';

export type Role = 'cz' | 'vi';
export type Theme = 'default' | 'warm' | 'calm';

export interface LinkPayload {
  email?: string | null;
  authProvider?: string | null;
}

export function useAppState(
  words: NormalizedWord[],
  walletAddress?: string | undefined,
  linkPayload?: LinkPayload
) {
  // Defaults; overwritten by fetchUserData (DB-only, no localStorage)
  const [role, setRole] = useState<Role>('vi');
  const [showAll, setShowAll] = useState(false);
  const [progress, setProgress] = useState<Record<string, ProgressData>>({});
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [showEnglish, setShowEnglish] = useState(true);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);
  const [theme, setThemeState] = useState<Theme>('default');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [memoryHooksOpen, setMemoryHooksOpen] = useState(false);
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'user' | 'editor'>('user');
  const [isHydrated, setIsHydrated] = useState(false);
  const lastMovedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);
  const isUpdatingFromServerRef = useRef(false);
  const isHydratedRef = useRef(false);
  const hasLinkedRef = useRef(false);

  // Apply server data to local state (shared between initial hydration and wallet-link)
  function applyServerData(serverData: SyncResponse) {
    if (serverData.progress && Object.keys(serverData.progress).length > 0) {
      const next: Record<string, ProgressData> = {};
      for (const [wordId, p] of Object.entries(serverData.progress)) {
        next[wordId] = {
          stageIndex: p.stageIndex,
          knownCount: p.knownCount,
          unknownCount: p.unknownCount,
          lastKnownAt: p.lastKnownAt ? new Date(p.lastKnownAt).getTime() : undefined,
          lastUnknownAt: p.lastUnknownAt ? new Date(p.lastUnknownAt).getTime() : undefined,
          nextDueAt: p.nextDueAt ? new Date(p.nextDueAt).getTime() : undefined,
        };
      }
      setProgress(next);
    }
    if (serverData.memory_hooks) setMemoryHooks(serverData.memory_hooks);
    if (serverData.category_filters) setSelectedCategories(new Set(serverData.category_filters));
    if (serverData.user?.id) setUserId(serverData.user.id);
    if (serverData.user?.role) setRole(serverData.user.role);
    setShowEnglish(serverData.user?.show_english ?? true);
    setShowCategoryBadges(serverData.user?.show_category_badges ?? false);
    setUserWalletAddress(serverData.user?.wallet_address ?? null);
    setUserEmail(serverData.user?.email ?? null);
    if (serverData.user?.user_role) {
      setUserRole(serverData.user.user_role);
      document.cookie = `wordlink_user_role=${serverData.user.user_role};path=/;max-age=31536000;SameSite=Lax`;
    }
  }

  // Load from DB only (no localStorage). Run once when we have words.
  useEffect(() => {
    if (hasLoadedRef.current || words.length === 0) return;
    hasLoadedRef.current = true;

    // Set a timeout to ensure hydration completes even if fetch hangs
    const HYDRATION_TIMEOUT = 10000; // 10 seconds
    const timeoutId = setTimeout(() => {
      if (!isHydratedRef.current) {
        console.warn('[useAppState] Hydration timeout - proceeding without server data');
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      }
    }, HYDRATION_TIMEOUT);

    fetchUserData()
      .then((serverData) => {
        clearTimeout(timeoutId);
        isUpdatingFromServerRef.current = true;
        applyServerData(serverData);

        isHydratedRef.current = true;
        setIsHydrated(true);
        // Delay clearing until after the sync effects have had a chance to check the flag
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
        });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error('[useAppState] Failed to fetch from server:', err);
        if (err instanceof Error) {
          console.error('[useAppState] Error message:', err.message);
          console.error('[useAppState] Error stack:', err.stack);
        }
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      });

    return () => {
      clearTimeout(timeoutId);
    };
  }, [words]);

  // Sync to DB when state changes (only after hydration; no localStorage)
  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    const progressArray = Object.entries(progress).map(([word_id, data]) => ({
      word_id,
      stage_index: data.stageIndex,
      known_count: data.knownCount,
      unknown_count: data.unknownCount,
      last_known_at: data.lastKnownAt ?? null,
      last_unknown_at: data.lastUnknownAt ?? null,
      next_due_at: data.nextDueAt ?? null,
    }));
    debouncedSync({ progress: progressArray }).catch((e) => console.error('[useAppState] Sync progress:', e));
  }, [progress, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ role }).catch((e) => console.error('[useAppState] Sync role:', e));
  }, [role, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    const hooksForSync: Record<string, string | null> = {};
    for (const [wordId, hook] of Object.entries(memoryHooks)) {
      hooksForSync[wordId] = hook || null;
    }
    debouncedSync({ memory_hooks: hooksForSync }).catch((e) => console.error('[useAppState] Sync memory hooks:', e));
  }, [memoryHooks, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ category_filters: Array.from(selectedCategories) }).catch((e) => console.error('[useAppState] Sync category filters:', e));
  }, [selectedCategories, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_english: showEnglish }).catch((e) => console.error('[useAppState] Sync show_english:', e));
  }, [showEnglish, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_category_badges: showCategoryBadges }).catch((e) => console.error('[useAppState] Sync show_category_badges:', e));
  }, [showCategoryBadges, isHydrated]);

  // Link wallet (and optionally email/authProvider) when user connects
  useEffect(() => {
    if (!isHydrated || !walletAddress || hasLinkedRef.current) return;
    hasLinkedRef.current = true;

    linkWallet(walletAddress, {
      email: linkPayload?.email ?? undefined,
      authProvider: linkPayload?.authProvider ?? undefined,
    })
      .then((serverData) => {
        isUpdatingFromServerRef.current = true;
        applyServerData(serverData);

        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
        });
      })
      .catch((err) => {
        console.error('[useAppState] Failed to link wallet:', err);
        hasLinkedRef.current = false; // Allow retry
      });
  }, [isHydrated, walletAddress, linkPayload?.email, linkPayload?.authProvider]);

  // Reset linked state when wallet disconnects
  useEffect(() => {
    if (!walletAddress) {
      hasLinkedRef.current = false;
    }
  }, [walletAddress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (lastMovedTimeoutRef.current) {
        clearTimeout(lastMovedTimeoutRef.current);
      }
    };
  }, []);

  // Load theme from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('wordlink-theme') as Theme | null;
      if (savedTheme && ['default', 'warm', 'calm'].includes(savedTheme)) {
        setThemeState(savedTheme);
      }
    }
  }, []);

  // Apply theme to document and persist to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('wordlink-theme', theme);
    }
  }, [theme]);

  // Theme setter
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
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

  // Mark word as known by its stable ID; flip display mode for next revisit
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

  // Mark word as really known (skips one stage) by its stable ID; flip display mode for next revisit
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

  // Mark word as unknown: regress -1 stage; flip display mode for next revisit
  const markUnknown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || {
        stageIndex: 0,
        knownCount: 0,
        unknownCount: 0,
      };
      const regressedStageIndex = Math.max(current.stageIndex - 1, 0);
      const regressedStage = STAGES[regressedStageIndex];
      const nextRepeatMs = regressedStage.intervalMs > 0 ? regressedStage.intervalMs : undefined;
      return {
        ...prev,
        [wordId]: {
          ...current,
          stageIndex: regressedStageIndex,
          unknownCount: current.unknownCount + 1,
          lastUnknownAt: Date.now(),
          nextDueAt: nextRepeatMs != null ? Date.now() + nextRepeatMs : undefined,
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

  // Memoized filtered words so downstream useMemo gets stable reference when filters unchanged
  const filteredWords = useMemo(() => {
    return words.filter((word) => matchesCategoryFilter(word, selectedCategories));
  }, [words, selectedCategories]);

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

  // Per-word display: 0 = show foreign only, 1 = show native. Rule: even (unknown+known) → foreign, odd → native.
  const getWordDisplayMode = useCallback((wordId: string): 0 | 1 => {
    const p = progress[wordId];
    const total = (p?.unknownCount ?? 0) + (p?.knownCount ?? 0);
    return total % 2 === 0 ? 0 : 1;
  }, [progress]);

  // Handle role change
  const handleRoleChange = useCallback((newRole: 'cz' | 'vi') => {
    setRole(newRole);
  }, []);

  return {
    role,
    setRole: handleRoleChange,
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
    updateProgress,
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
    userRole,
    isEditor: userRole === 'editor',
    isHydrated,
  };
}

