'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';
import { debouncedSync, hasReceivedServerSnapshot } from '@/lib/sync';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import {
  DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  normalizeMemoryHookDisableFromStage,
} from '@/lib/words';

export type Role = 'cz' | 'vi';

function normalizeCategoryOrderValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function usePreferences(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [role, setRoleState] = useState<Role>('vi');
  const [showAll, setShowAll] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [memoryHooksEnabled, setMemoryHooksEnabled] = useState(true);
  const [memoryHookDisableFromStage, setMemoryHookDisableFromStageState] = useState<number>(
    DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE
  );
  const [categoryOrder, setCategoryOrderState] = useState<string[]>([]);

  // Gate sync on hasReceivedServerSnapshot(): without it, a failed initial GET
  // (no session, offline) leaves the local defaults in place, and the next
  // authenticated request would overwrite the user's remote settings with
  // those defaults. The flag flips inside applyServerData once the server
  // payload has been applied, so by the time the user actually changes a
  // preference and re-runs the effect, the gate is open.
  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({ role }).catch((e) => console.error('[usePreferences] sync role:', e));
  }, [role, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({ show_english: showEnglish }).catch((e) =>
      console.error('[usePreferences] sync show_english:', e)
    );
  }, [showEnglish, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({ show_category_badges: showCategoryBadges }).catch((e) =>
      console.error('[usePreferences] sync show_category_badges:', e)
    );
  }, [showCategoryBadges, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({ show_pronunciation: showPronunciation }).catch((e) =>
      console.error('[usePreferences] sync show_pronunciation:', e)
    );
  }, [showPronunciation, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({ memory_hooks_enabled: memoryHooksEnabled }).catch((e) =>
      console.error('[usePreferences] sync memory_hooks_enabled:', e)
    );
  }, [memoryHooksEnabled, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({
      memory_hook_disable_from_stage: normalizeMemoryHookDisableFromStage(memoryHookDisableFromStage),
    }).catch((e) =>
      console.error('[usePreferences] sync memory_hook_disable_from_stage:', e)
    );
  }, [memoryHookDisableFromStage, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    debouncedSync({ category_order: categoryOrder }).catch((e) =>
      console.error('[usePreferences] sync category_order:', e)
    );
  }, [categoryOrder, isHydrated, isUpdatingFromServerRef]);

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole);
    postTabMessage({ type: 'preferences_changed', patch: { role: newRole } });
  }, []);
  const setShowEnglishPreference = useCallback(() => {
    setShowEnglish(false);
    postTabMessage({ type: 'preferences_changed', patch: { showEnglish: false } });
  }, []);
  const setShowCategoryBadgesPreference = useCallback(() => {
    setShowCategoryBadges(false);
    postTabMessage({ type: 'preferences_changed', patch: { showCategoryBadges: false } });
  }, []);
  const setShowPronunciationPreference = useCallback(() => {
    setShowPronunciation(false);
    postTabMessage({ type: 'preferences_changed', patch: { showPronunciation: false } });
  }, []);
  const setMemoryHooksEnabledPreference = useCallback((value: boolean) => {
    setMemoryHooksEnabled(value);
    postTabMessage({ type: 'preferences_changed', patch: { memoryHooksEnabled: value } });
  }, []);
  const setMemoryHookDisableFromStage = useCallback((stage: number) => {
    const normalized = normalizeMemoryHookDisableFromStage(stage);
    setMemoryHookDisableFromStageState(normalized);
    postTabMessage({
      type: 'preferences_changed',
      patch: { memoryHookDisableFromStage: normalized },
    });
  }, []);
  const setCategoryOrder = useCallback((order: string[] | ((prev: string[]) => string[])) => {
    setCategoryOrderState((prev) => {
      const rawNext = typeof order === 'function' ? order(prev) : order;
      const next = normalizeCategoryOrderValue(rawNext);
      if (areStringArraysEqual(prev, next)) return prev;
      postTabMessage({ type: 'preferences_changed', patch: { categoryOrder: next } });
      return next;
    });
  }, []);

  const applyServerPreferences = useCallback((user: SyncResponse['user']) => {
    if (user.role) setRoleState(user.role);
    setShowEnglish(false);
    setShowCategoryBadges(false);
    setShowPronunciation(false);
    setMemoryHooksEnabled(user.memory_hooks_enabled ?? true);
    setMemoryHookDisableFromStageState(
      normalizeMemoryHookDisableFromStage(user.memory_hook_disable_from_stage)
    );
    const nextCategoryOrder = normalizeCategoryOrderValue(user.category_order);
    setCategoryOrderState((prev) =>
      areStringArraysEqual(prev, nextCategoryOrder) ? prev : nextCategoryOrder
    );
  }, []);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'preferences_changed') return;
      const patch = message.patch;
      if (patch.role === 'cz' || patch.role === 'vi') setRoleState(patch.role);
      if (typeof patch.showEnglish === 'boolean') setShowEnglish(false);
      if (typeof patch.showCategoryBadges === 'boolean') {
        setShowCategoryBadges(false);
      }
      if (typeof patch.showPronunciation === 'boolean') {
        setShowPronunciation(false);
      }
      if (typeof patch.memoryHooksEnabled === 'boolean') {
        setMemoryHooksEnabled(patch.memoryHooksEnabled);
      }
      if (typeof patch.memoryHookDisableFromStage === 'number') {
        setMemoryHookDisableFromStageState(
          normalizeMemoryHookDisableFromStage(patch.memoryHookDisableFromStage)
        );
      }
      if (Array.isArray(patch.categoryOrder)) {
        const nextCategoryOrder = normalizeCategoryOrderValue(patch.categoryOrder);
        setCategoryOrderState((prev) =>
          areStringArraysEqual(prev, nextCategoryOrder) ? prev : nextCategoryOrder
        );
      }
    });
  }, []);

  return {
    role,
    setRole,
    showAll,
    setShowAll,
    showEnglish,
    setShowEnglish: setShowEnglishPreference,
    showCategoryBadges,
    setShowCategoryBadges: setShowCategoryBadgesPreference,
    showPronunciation,
    setShowPronunciation: setShowPronunciationPreference,
    memoryHooksEnabled,
    setMemoryHooksEnabled: setMemoryHooksEnabledPreference,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    categoryOrder,
    setCategoryOrder,
    applyServerPreferences,
  };
}
