# App State Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the monolithic `useAppState` into domain hooks, add an `AppStateContext` to eliminate prop drilling through `AppLayout`, and deduplicate shared logic (`usePressHandlers`, `useWordStream`) duplicated across both pages.

**Architecture:** Domain hooks (`useTheme`, `useUserProfile`, `useProgress`, `usePreferences`, `useMemoryHooks`, `useCategoryFilter`, `useGameScore`) are each self-contained with their own sync effects; `useAppState` becomes a thin orchestrator handling hydration and wallet-linking. A `AppStateContext` wraps both pages so `AppLayout` and its panels can consume state directly instead of receiving ~25 props.

**Tech Stack:** React 18, Next.js 14 (App Router), TypeScript, Tailwind v4, Drizzle + Postgres

---

## Current Pain Points

- `useAppState.ts` is 436 lines mixing 7 concerns
- `AppLayout` takes ~25 props — mostly pass-through to panels
- MutationObserver press-handler logic is copy-pasted verbatim in `page.tsx` AND `edit/page.tsx` (~80 lines each)
- Due/new/settling bucketing logic also duplicated in both pages

---

## Task 1: Create `hooks/useTheme.ts`

**Files:**
- Create: `hooks/useTheme.ts`

Extract theme management from `useAppState.ts:219-240`.

**Step 1: Write the file**

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'default' | 'warm' | 'calm';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('wordlink-theme') as Theme | null;
    if (saved && ['default', 'warm', 'calm'].includes(saved)) setThemeState(saved);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wordlink-theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => setThemeState(newTheme), []);

  return { theme, setTheme };
}
```

**Step 2: Verify TypeScript is happy**

```bash
cd /Users/janmiksik/Desktop/projects/own/+/lang-learning-app/wordlink && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors related to this file.

---

## Task 2: Create `hooks/useUserProfile.ts`

**Files:**
- Create: `hooks/useUserProfile.ts`

Extract identity state from `useAppState.ts:32-35, 63-73`.

```ts
'use client';

import { useState, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';

export function useUserProfile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRoleState] = useState<'user' | 'editor'>('user');

  const applyServerProfile = useCallback((user: SyncResponse['user']) => {
    if (user.id) setUserId(user.id);
    setUserWalletAddress(user.wallet_address ?? null);
    setUserEmail(user.email ?? null);
    if (user.user_role) {
      setUserRoleState(user.user_role);
      document.cookie = `wordlink_user_role=${user.user_role};path=/;max-age=31536000;SameSite=Lax`;
    }
  }, []);

  return {
    userId,
    userWalletAddress,
    userEmail,
    userRole,
    isEditor: userRole === 'editor',
    applyServerProfile,
  };
}
```

---

## Task 3: Create `hooks/useProgress.ts`

**Files:**
- Create: `hooks/useProgress.ts`

Extract progress state + mark actions from `useAppState.ts:25, 38-39, 242-344`.

```ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressData } from '@/lib/sync';
import { STAGES } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';

export function useProgress(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [progress, setProgress] = useState<Record<string, ProgressData>>({});
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const lastMovedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync to server
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
    debouncedSync({ progress: progressArray }).catch((e) =>
      console.error('[useProgress] sync:', e)
    );
  }, [progress, isHydrated]);

  // Cleanup timeout
  useEffect(() => () => {
    if (lastMovedTimeoutRef.current) clearTimeout(lastMovedTimeoutRef.current);
  }, []);

  const applyServerProgress = useCallback(
    (serverProgress: SyncResponse['progress']) => {
      if (!serverProgress || Object.keys(serverProgress).length === 0) return;
      const next: Record<string, ProgressData> = {};
      for (const [wordId, p] of Object.entries(serverProgress)) {
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
    },
    []
  );

  const setLastMoved = useCallback((wordId: string) => {
    setLastMovedId(wordId);
    if (lastMovedTimeoutRef.current) clearTimeout(lastMovedTimeoutRef.current);
    lastMovedTimeoutRef.current = setTimeout(() => setLastMovedId(null), 1000);
  }, []);

  const updateProgress = useCallback((wordId: string, updates: Partial<ProgressData>) => {
    setProgress((prev) => {
      const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      return { ...prev, [wordId]: { ...current, ...updates } };
    });
  }, []);

  const markKnown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
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
    setLastMoved(wordId);
  }, [setLastMoved]);

  const markReallyKnown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
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
    setLastMoved(wordId);
  }, [setLastMoved]);

  const markUnknown = useCallback((wordId: string) => {
    setProgress((prev) => {
      const current = prev[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
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
    setLastMoved(wordId);
  }, [setLastMoved]);

  const getWordDisplayMode = useCallback(
    (wordId: string): 0 | 1 => {
      const p = progress[wordId];
      const total = (p?.unknownCount ?? 0) + (p?.knownCount ?? 0);
      return total % 2 === 0 ? 0 : 1;
    },
    [progress]
  );

  return {
    progress,
    lastMovedId,
    updateProgress,
    markKnown,
    markReallyKnown,
    markUnknown,
    getWordDisplayMode,
    applyServerProgress,
  };
}
```

---

## Task 4: Create `hooks/usePreferences.ts`

**Files:**
- Create: `hooks/usePreferences.ts`

Extract role + UI toggles from `useAppState.ts:23-24, 28-29, 137-164, 398-400`.

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';
import { debouncedSync } from '@/lib/sync';

export type Role = 'cz' | 'vi';

export function usePreferences(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [role, setRoleState] = useState<Role>('vi');
  const [showAll, setShowAll] = useState(false);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ role }).catch((e) => console.error('[usePreferences] sync role:', e));
  }, [role, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_english: showEnglish }).catch((e) =>
      console.error('[usePreferences] sync show_english:', e)
    );
  }, [showEnglish, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_category_badges: showCategoryBadges }).catch((e) =>
      console.error('[usePreferences] sync show_category_badges:', e)
    );
  }, [showCategoryBadges, isHydrated]);

  const setRole = useCallback((newRole: Role) => setRoleState(newRole), []);

  const applyServerPreferences = useCallback((user: SyncResponse['user']) => {
    if (user.role) setRoleState(user.role);
    setShowEnglish(user.show_english ?? true);
    setShowCategoryBadges(user.show_category_badges ?? false);
  }, []);

  return {
    role,
    setRole,
    showAll,
    setShowAll,
    showEnglish,
    setShowEnglish,
    showCategoryBadges,
    setShowCategoryBadges,
    applyServerPreferences,
  };
}
```

---

## Task 5: Create `hooks/useMemoryHooks.ts`

**Files:**
- Create: `hooks/useMemoryHooks.ts`

Extract from `useAppState.ts:26, 142-148, 364-388`.

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';
import type { Role } from './usePreferences';

export function useMemoryHooks(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>,
  role: Role
) {
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    const hooksForSync: Record<string, string | null> = {};
    for (const [wordId, hook] of Object.entries(memoryHooks)) {
      hooksForSync[wordId] = hook || null;
    }
    debouncedSync({ memory_hooks: hooksForSync }).catch((e) =>
      console.error('[useMemoryHooks] sync:', e)
    );
  }, [memoryHooks, isHydrated]);

  const applyServerMemoryHooks = useCallback((hooks: Record<string, string>) => {
    setMemoryHooks(hooks);
  }, []);

  const getMemoryHook = useCallback(
    (wordId: string) => memoryHooks[wordId] || '',
    [memoryHooks]
  );

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

  const getSuggestedMemoryHook = useCallback(
    (word: NormalizedWord) => {
      if (!word) return '';
      if (role === 'vi') return word.viHint || '';
      if (role === 'cz') return word.czHint || '';
      return '';
    },
    [role]
  );

  return {
    memoryHooks,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    applyServerMemoryHooks,
  };
}
```

---

## Task 6: Create `hooks/useCategoryFilter.ts`

**Files:**
- Create: `hooks/useCategoryFilter.ts`

Extract from `useAppState.ts:27, 151-154, 346-362`.

```ts
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchesCategoryFilter } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';

export function useCategoryFilter(
  words: NormalizedWord[],
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ category_filters: Array.from(selectedCategories) }).catch((e) =>
      console.error('[useCategoryFilter] sync:', e)
    );
  }, [selectedCategories, isHydrated]);

  const applyServerCategories = useCallback((categories: string[]) => {
    setSelectedCategories(new Set(categories));
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const filteredWords = useMemo(
    () => words.filter((word) => matchesCategoryFilter(word, selectedCategories)),
    [words, selectedCategories]
  );

  return { selectedCategories, toggleCategory, filteredWords, applyServerCategories };
}
```

---

## Task 7: Create `hooks/useGameScore.ts`

**Files:**
- Create: `hooks/useGameScore.ts`

Extract from `useAppState.ts:36, 166-178`.

```ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { syncUserData } from '@/lib/sync';

export function useGameScore(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [gameScore, setGameScore] = useState(0);
  const gameScoreSyncedRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!gameScoreSyncedRef.current) {
      gameScoreSyncedRef.current = true;
      return;
    }
    syncUserData({ game_score: gameScore }).catch((e) =>
      console.error('[useGameScore] sync:', e)
    );
  }, [gameScore, isHydrated]);

  const applyServerGameScore = useCallback((score: number) => {
    setGameScore(score);
  }, []);

  return { gameScore, setGameScore, applyServerGameScore };
}
```

---

## Task 8: Rewrite `hooks/useAppState.ts` as thin orchestrator

**Files:**
- Modify: `hooks/useAppState.ts` (replace entire file)

`useAppState` now just composes domain hooks + handles the one-time hydration and wallet-linking effects. The public return shape is **unchanged** so pages need no edits yet.

```ts
'use client';

import { useState, useEffect, useRef } from 'react';
import type { SyncResponse } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';
import { fetchUserData, linkWallet } from '@/lib/sync';
import { useTheme } from './useTheme';
import { useUserProfile } from './useUserProfile';
import { useProgress } from './useProgress';
import { usePreferences } from './usePreferences';
import { useMemoryHooks } from './useMemoryHooks';
import { useCategoryFilter } from './useCategoryFilter';
import { useGameScore } from './useGameScore';

export type { Role } from './usePreferences';
export type { Theme } from './useTheme';

export interface LinkPayload {
  email?: string | null;
  authProvider?: string | null;
}

export function useAppState(
  words: NormalizedWord[],
  walletAddress?: string | undefined,
  linkPayload?: LinkPayload
) {
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = useRef(false);
  const isUpdatingFromServerRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const hasLinkedRef = useRef(false);

  const theme = useTheme();
  const userProfile = useUserProfile();
  const progress = useProgress(isHydrated, isUpdatingFromServerRef);
  const preferences = usePreferences(isHydrated, isUpdatingFromServerRef);
  const memoryHooks = useMemoryHooks(isHydrated, isUpdatingFromServerRef, preferences.role);
  const categories = useCategoryFilter(words, isHydrated, isUpdatingFromServerRef);
  const gameScore = useGameScore(isHydrated, isUpdatingFromServerRef);

  function applyServerData(serverData: SyncResponse) {
    if (serverData.progress) progress.applyServerProgress(serverData.progress);
    if (serverData.memory_hooks) memoryHooks.applyServerMemoryHooks(serverData.memory_hooks);
    if (serverData.category_filters) categories.applyServerCategories(serverData.category_filters);
    if (serverData.user) {
      userProfile.applyServerProfile(serverData.user);
      preferences.applyServerPreferences(serverData.user);
    }
    if (serverData.user?.game_score !== undefined) {
      gameScore.applyServerGameScore(serverData.user.game_score);
    }
  }

  // Hydrate from server once on mount
  useEffect(() => {
    if (hasLoadedRef.current || words.length === 0) return;
    hasLoadedRef.current = true;

    const HYDRATION_TIMEOUT = 15000;
    const timeoutId = setTimeout(() => {
      if (!isHydratedRef.current) {
        console.warn('[useAppState] Hydration timeout — proceeding without server data');
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
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
        });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error('[useAppState] Failed to fetch:', err);
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      });

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  // Link wallet when user connects
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
        hasLinkedRef.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, walletAddress, linkPayload?.email, linkPayload?.authProvider]);

  // Reset linked state when wallet disconnects
  useEffect(() => {
    if (!walletAddress) hasLinkedRef.current = false;
  }, [walletAddress]);

  return {
    ...theme,
    ...userProfile,
    ...progress,
    ...preferences,
    ...memoryHooks,
    ...categories,
    ...gameScore,
    isHydrated,
  };
}
```

**Step: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors (public API of useAppState is unchanged).

---

## Task 9: Create `context/AppStateContext.tsx`

**Files:**
- Create: `context/AppStateContext.tsx`

```tsx
'use client';

import { createContext, useContext } from 'react';
import type { useAppState } from '@/hooks/useAppState';

type AppState = ReturnType<typeof useAppState>;

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({
  value,
  children,
}: {
  value: AppState;
  children: React.ReactNode;
}) {
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppStateContext(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppStateContext must be used within AppStateProvider');
  return ctx;
}
```

---

## Task 10: Create `hooks/usePressHandlers.ts`

**Files:**
- Create: `hooks/usePressHandlers.ts`

Extract the duplicated MutationObserver press-handler from `page.tsx:184-331` and `edit/page.tsx:122-247`.

```ts
'use client';

import { useEffect } from 'react';

/**
 * Attaches press (mousedown / touchstart) state handlers to all
 * `.cover-target` elements inside `container`, including ones added
 * later via DOM mutations (virtualized lists).
 *
 * @param containerRef - ref to the scrollable container element
 * @param deps - additional dependencies that should re-attach handlers (e.g. selectedCategories, role)
 */
export function usePressHandlers(
  containerRef: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList
) {
  useEffect(() => {
    if (!containerRef.current) return;

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
            if (pressTimeout) { clearTimeout(pressTimeout); pressTimeout = null; }
            return;
          }
          if (!isScrolling && pressed) e.preventDefault();
        }
      };

      const onUp = () => {
        if (pressTimeout) { clearTimeout(pressTimeout); pressTimeout = null; }
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

      cleanupMap.set(el, () => {
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('touchstart', onDown);
        el.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('touchcancel', onUp);
        if (pressTimeout) clearTimeout(pressTimeout);
      });
    };

    const container = containerRef.current;
    container.querySelectorAll<HTMLElement>('.cover-target').forEach(attachPressHandlers);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList.contains('cover-target')) attachPressHandlers(node);
          node.querySelectorAll?.('.cover-target').forEach((child) =>
            attachPressHandlers(child as HTMLElement)
          );
        });
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          cleanupMap.get(node)?.();
          cleanupMap.delete(node);
          node.querySelectorAll?.('.cover-target').forEach((child) => {
            cleanupMap.get(child as HTMLElement)?.();
            cleanupMap.delete(child as HTMLElement);
          });
        });
      });
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupMap.forEach((cleanup) => cleanup());
      cleanupMap.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, ...deps]);
}
```

---

## Task 11: Create `hooks/useWordStream.ts`

**Files:**
- Create: `hooks/useWordStream.ts`

Deduplicate the due/new/settling bucketing from `page.tsx:343-365` and `edit/page.tsx:360-379`.

```ts
'use client';

import { useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import { isDue } from '@/lib/words';

export interface WordStream {
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  settlingWords: NormalizedWord[];
}

export function useWordStream(
  filteredWords: NormalizedWord[],
  progress: Record<string, ProgressData>,
  isHydrated: boolean
): WordStream {
  return useMemo(() => {
    if (!isHydrated) {
      return { dueWords: [], newWords: [], settlingWords: [] };
    }

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
  }, [filteredWords, progress, isHydrated]);
}
```

---

## Task 12: Update `components/CategoryPanel.tsx` to consume from context

**Files:**
- Modify: `components/CategoryPanel.tsx`

Remove `selectedCategories` and `onToggleCategory` props — read from context instead.

```tsx
'use client';

import { useAppStateContext } from '@/context/AppStateContext';

interface CategoryPanelProps {
  isOpen: boolean;
  categories: Array<{ name: string; count: number }>;
  onClose?: () => void;
}

export function CategoryPanel({ isOpen, categories, onClose }: CategoryPanelProps) {
  const { selectedCategories, toggleCategory: onToggleCategory } = useAppStateContext();
  // ... rest of JSX unchanged, still uses selectedCategories and onToggleCategory
}
```

Copy the JSX from the current implementation — only the props interface and destructuring change.

---

## Task 13: Update `components/SettingsPanel.tsx` to consume from context

**Files:**
- Modify: `components/SettingsPanel.tsx`

Remove from props: `role`, `onRoleChange`, `showEnglish`, `onShowEnglishChange`, `showCategoryBadges`, `onShowCategoryBadgesChange`, `theme`, `onThemeChange`, `userId`, `userWalletAddress`, `userEmail` — read from context.

Keep as props (page/layout-level concerns): `minigameFrequency`, `onMinigameFrequencyChange`, `viewMode`, `onViewModeChange`, `isOpen`, `onClose`, `isAuthenticated`, `authEmail`, `authAddress`, `onSignOut`.

---

## Task 14: Update `components/AppLayout.tsx` to consume from context

**Files:**
- Modify: `components/AppLayout.tsx`

Remove from `AppLayoutProps`: `showAll`, `onShowAll`, `selectedCategories`, `role`, `onRoleChange`, `showEnglish`, `onShowEnglishChange`, `showCategoryBadges`, `onShowCategoryBadgesChange`, `theme`, `onThemeChange`, `userId`, `userWalletAddress`, `userEmail`, `score`.

AppLayout reads these directly from `useAppStateContext()`.

Remaining props:
```ts
interface AppLayoutProps {
  viewMode: 'card' | 'stream';
  onViewModeChange: (mode: 'card' | 'stream') => void;
  minigameFrequency: import('@/lib/minigames').MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: import('@/lib/minigames').MinigameFrequencyRange) => void;
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void;
  categories: Array<{ name: string; count: number }>;
  progressStats: import('@/lib/progress-stats').ProgressStats;
  header?: ReactNode;
  children: ReactNode;
}
```

---

## Task 15: Update `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

1. Wrap return in `<AppStateProvider value={appState}>` (where `appState = useAppState(...)`)
2. Replace inline press-handler effect with `usePressHandlers(phrasesRef, [selectedCategories, showAll, role])`
3. Replace inline bucketing with `const { dueWords, newWords, settlingWords } = useWordStream(filteredWords, progress, isHydrated)`
4. Remove props from `<AppLayout>` that moved to context

---

## Task 16: Update `app/edit/page.tsx`

**Files:**
- Modify: `app/edit/page.tsx`

Same as Task 15 but for edit page:
1. Wrap in `<AppStateProvider>`
2. Use `usePressHandlers`
3. Use `useWordStream`
4. Remove moved props from `<AppLayout>`

---

## Task 17: Final TypeScript check + smoke test

```bash
npx tsc --noEmit 2>&1
pnpm dev &
# open http://localhost:3000 — verify cards load, progress marks work, settings panel opens
```

---

## Summary of file changes

| File | Action |
|------|--------|
| `hooks/useTheme.ts` | Create |
| `hooks/useUserProfile.ts` | Create |
| `hooks/useProgress.ts` | Create |
| `hooks/usePreferences.ts` | Create |
| `hooks/useMemoryHooks.ts` | Create |
| `hooks/useCategoryFilter.ts` | Create |
| `hooks/useGameScore.ts` | Create |
| `hooks/useAppState.ts` | Rewrite (thin orchestrator) |
| `context/AppStateContext.tsx` | Create |
| `hooks/usePressHandlers.ts` | Create |
| `hooks/useWordStream.ts` | Create |
| `components/CategoryPanel.tsx` | Slim props |
| `components/SettingsPanel.tsx` | Slim props |
| `components/AppLayout.tsx` | Slim props |
| `app/page.tsx` | Use context + new hooks |
| `app/edit/page.tsx` | Use context + new hooks |
