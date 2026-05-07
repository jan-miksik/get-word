'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import type { Role } from './preferences';

type MemoryHookTarget = string | Pick<NormalizedWord, 'id' | 'canonicalWordId'>;

function getMemoryHookAliases(target: MemoryHookTarget): string[] {
  if (typeof target === 'string') return [target];

  return Array.from(
    new Set([target.id, target.canonicalWordId].filter((value): value is string => Boolean(value)))
  );
}

function getPrimaryMemoryHookKey(target: MemoryHookTarget): string {
  if (typeof target === 'string') return target;
  return target.canonicalWordId ?? target.id;
}

export function useMemoryHooks(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>,
  role: Role
) {
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({});

  const applyServerMemoryHooks = useCallback((hooks: Record<string, string>) => {
    setMemoryHooks(hooks);
  }, []);

  const getMemoryHook = useCallback((target: MemoryHookTarget) => {
    for (const key of getMemoryHookAliases(target)) {
      if (memoryHooks[key]) return memoryHooks[key];
    }
    return '';
  }, [memoryHooks]);

  const setMemoryHook = useCallback((target: MemoryHookTarget, hook: string) => {
    const trimmed = hook.trim();
    const aliases = getMemoryHookAliases(target);
    const syncKey = getPrimaryMemoryHookKey(target);

    setMemoryHooks((prev) => {
      const next = { ...prev };
      for (const key of aliases) {
        if (trimmed) {
          next[key] = trimmed;
        } else {
          delete next[key];
        }
      }
      return next;
    });
    if (isHydrated && !isUpdatingFromServerRef.current) {
      debouncedSync({ memory_hooks: { [syncKey]: trimmed || null } }).catch((e) =>
        console.error('[useMemoryHooks] sync:', e)
      );
      postTabMessage({ type: 'memory_hook_changed', wordId: syncKey, hook: trimmed });
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
