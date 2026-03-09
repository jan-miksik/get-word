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
