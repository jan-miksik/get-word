'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';
import { debouncedSync } from '@/lib/sync';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
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

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole);
    postTabMessage({ type: 'preferences_changed', patch: { role: newRole } });
  }, []);
  const setShowEnglishPreference = useCallback((value: boolean) => {
    setShowEnglish(value);
    postTabMessage({ type: 'preferences_changed', patch: { showEnglish: value } });
  }, []);
  const setShowCategoryBadgesPreference = useCallback((value: boolean) => {
    setShowCategoryBadges(value);
    postTabMessage({ type: 'preferences_changed', patch: { showCategoryBadges: value } });
  }, []);
  const setShowPronunciationPreference = useCallback((value: boolean) => {
    setShowPronunciation(value);
    postTabMessage({ type: 'preferences_changed', patch: { showPronunciation: value } });
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
      const next = typeof order === 'function' ? order(prev) : order;
      postTabMessage({ type: 'preferences_changed', patch: { categoryOrder: next } });
      return next;
    });
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

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'preferences_changed') return;
      const patch = message.patch;
      if (patch.role === 'cz' || patch.role === 'vi') setRoleState(patch.role);
      if (typeof patch.showEnglish === 'boolean') setShowEnglish(patch.showEnglish);
      if (typeof patch.showCategoryBadges === 'boolean') {
        setShowCategoryBadges(patch.showCategoryBadges);
      }
      if (typeof patch.showPronunciation === 'boolean') {
        setShowPronunciation(patch.showPronunciation);
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
        setCategoryOrderState(patch.categoryOrder.map(String));
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
