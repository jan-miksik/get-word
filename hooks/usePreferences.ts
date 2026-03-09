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
