'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import type { Role } from './preferences';

export function useMemoryHooks(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>,
  role: Role
) {
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({});

  const applyServerMemoryHooks = useCallback((hooks: Record<string, string>) => {
    setMemoryHooks(hooks);
  }, []);

  const getMemoryHook = useCallback(
    (wordId: string) => memoryHooks[wordId] || '',
    [memoryHooks]
  );

  const setMemoryHook = useCallback((wordId: string, hook: string) => {
    const trimmed = hook.trim();
    setMemoryHooks((prev) => {
      const next = { ...prev };
      if (trimmed) {
        next[wordId] = trimmed;
      } else {
        delete next[wordId];
      }
      return next;
    });
    if (isHydrated && !isUpdatingFromServerRef.current) {
      debouncedSync({ memory_hooks: { [wordId]: trimmed || null } }).catch((e) =>
        console.error('[useMemoryHooks] sync:', e)
      );
      postTabMessage({ type: 'memory_hook_changed', wordId, hook: trimmed });
    }
  }, [isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'memory_hook_changed') return;
      setMemoryHooks((prev) => {
        const next = { ...prev };
        if (message.hook) next[message.wordId] = message.hook;
        else delete next[message.wordId];
        return next;
      });
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
