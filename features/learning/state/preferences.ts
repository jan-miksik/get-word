'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';
import { debouncedSync } from '@/lib/sync';
import {
  DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  normalizeMemoryHookDisableFromStage,
} from '@/lib/words';

export type Role = 'cz' | 'vi';

export function usePreferences(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [role, setRoleState] = useState<Role>('vi');
  const [showAll, setShowAll] = useState(false);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [memoryHooksEnabled, setMemoryHooksEnabled] = useState(true);
  const [memoryHookDisableFromStage, setMemoryHookDisableFromStageState] = useState<number>(
    DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE
  );
  const [categoryOrder, setCategoryOrderState] = useState<string[]>([]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ role }).catch((e) => console.error('[usePreferences] sync role:', e));
  }, [role, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_english: showEnglish }).catch((e) =>
      console.error('[usePreferences] sync show_english:', e)
    );
  }, [showEnglish, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_category_badges: showCategoryBadges }).catch((e) =>
      console.error('[usePreferences] sync show_category_badges:', e)
    );
  }, [showCategoryBadges, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ show_pronunciation: showPronunciation }).catch((e) =>
      console.error('[usePreferences] sync show_pronunciation:', e)
    );
  }, [showPronunciation, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ memory_hooks_enabled: memoryHooksEnabled }).catch((e) =>
      console.error('[usePreferences] sync memory_hooks_enabled:', e)
    );
  }, [memoryHooksEnabled, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({
      memory_hook_disable_from_stage: normalizeMemoryHookDisableFromStage(memoryHookDisableFromStage),
    }).catch((e) =>
      console.error('[usePreferences] sync memory_hook_disable_from_stage:', e)
    );
  }, [memoryHookDisableFromStage, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ category_order: categoryOrder }).catch((e) =>
      console.error('[usePreferences] sync category_order:', e)
    );
  }, [categoryOrder, isHydrated, isUpdatingFromServerRef]);

  const setRole = useCallback((newRole: Role) => setRoleState(newRole), []);
  const setMemoryHookDisableFromStage = useCallback((stage: number) => {
    setMemoryHookDisableFromStageState(normalizeMemoryHookDisableFromStage(stage));
  }, []);
  const setCategoryOrder = useCallback((order: string[] | ((prev: string[]) => string[])) => {
    setCategoryOrderState(order);
  }, []);

  const applyServerPreferences = useCallback((user: SyncResponse['user']) => {
    if (user.role) setRoleState(user.role);
    setShowEnglish(user.show_english ?? true);
    setShowCategoryBadges(user.show_category_badges ?? false);
    setShowPronunciation(user.show_pronunciation ?? false);
    setMemoryHooksEnabled(user.memory_hooks_enabled ?? true);
    setMemoryHookDisableFromStageState(
      normalizeMemoryHookDisableFromStage(user.memory_hook_disable_from_stage)
    );
    setCategoryOrderState(Array.isArray(user.category_order) ? user.category_order : []);
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
    showPronunciation,
    setShowPronunciation,
    memoryHooksEnabled,
    setMemoryHooksEnabled,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    categoryOrder,
    setCategoryOrder,
    applyServerPreferences,
  };
}
