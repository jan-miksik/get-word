'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { enqueueOp } from '@/lib/local-first/enqueue';
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

/**
 * Tracks values the user (or another tab) wrote locally that haven't been
 * confirmed echoed back by the server yet. Used as a sync-readable shadow over
 * server snapshots — without it, a snapshot fetched mid-flight would briefly
 * revert a just-typed edit. The IDB outbox is async so we can't consult it
 * from the merge code path; this in-memory mirror works regardless of IDB
 * availability and converges as the server catches up.
 */
type PendingHookMap = Map<string, { value: string; updatedAt: number }>;

/**
 * Reconcile a pending local-write map against server state. For each pending
 * key: drop the entry if the server already reflects our value (the write
 * landed), otherwise keep our value and shadow the server. Mutates `pending`
 * and returns the merged hook map.
 */
function reconcilePending(
  serverState: Record<string, string>,
  pending: PendingHookMap,
): Record<string, string> {
  const merged: Record<string, string> = { ...serverState };
  for (const [key, entry] of pending) {
    const serverValue = merged[key] ?? '';
    if (serverValue === entry.value) {
      pending.delete(key);
      continue;
    }
    if (entry.value) {
      merged[key] = entry.value;
    } else {
      delete merged[key];
    }
  }
  return merged;
}

export function useMemoryHooks(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>,
  role: Role
) {
  const [memoryHooks, setMemoryHooks] = useState<Record<string, string>>({});
  // Pending local writes shadowed over server snapshots until the server
  // catches up. Also doubles as the LWW timestamp source for tab-sync.
  const pendingRef = useRef<PendingHookMap>(new Map());

  const applyServerMemoryHooks = useCallback((hooks: Record<string, string>) => {
    // Replay any in-flight local writes on top so the user's just-typed edit
    // doesn't briefly revert while a snapshot is processed.
    setMemoryHooks(reconcilePending(hooks, pendingRef.current));
  }, []);

  // Delta variant: merge updated hooks and drop tombstoned keys without
  // touching unmentioned entries. Used for ?since= delta fetches.
  const mergeServerMemoryHooks = useCallback(
    (updated: Record<string, string>, deleted: string[] = []) => {
      const hasUpdates = Object.keys(updated).length > 0;
      const hasDeletes = deleted.length > 0;
      if (!hasUpdates && !hasDeletes) return;
      setMemoryHooks((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(updated)) {
          next[key] = value;
        }
        for (const key of deleted) {
          delete next[key];
        }
        // For delta merges, only reconcile the keys touched by this delta —
        // pending entries for unmentioned keys aren't reflected in `next` so we
        // can't compare them, and overwriting unmentioned keys would defeat
        // the purpose of a delta.
        const touchedKeys = new Set<string>([
          ...Object.keys(updated),
          ...deleted,
        ]);
        for (const key of touchedKeys) {
          const entry = pendingRef.current.get(key);
          if (!entry) continue;
          const serverValue = next[key] ?? '';
          if (serverValue === entry.value) {
            pendingRef.current.delete(key);
          } else if (entry.value) {
            next[key] = entry.value;
          } else {
            delete next[key];
          }
        }
        return next;
      });
    },
    []
  );

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
      const updatedAt = Date.now();
      // Record under every alias so a server snapshot keyed by either id can
      // resolve correctly. The map's `updatedAt` doubles as the LWW timestamp
      // for tab-sync arbitration below.
      for (const key of aliases) {
        pendingRef.current.set(key, { value: trimmed, updatedAt });
      }
      void enqueueOp({
        entity: 'memory_hook',
        opType: 'set',
        payload: { id: syncKey, text: trimmed || null },
        legacyPayload: { memory_hooks: { [syncKey]: trimmed || null } },
      }).catch((e) => console.error('[useMemoryHooks] enqueue:', e));
      postTabMessage({ type: 'memory_hook_changed', wordId: syncKey, hook: trimmed, updatedAt });
    }
  }, [isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'memory_hook_changed') return;
      // LWW guard: if we wrote to this key more recently than the broadcast,
      // ignore it. Otherwise an out-of-order delivery (or a save+broadcast race
      // between two tabs) could revert the user's just-typed edit.
      const existing = pendingRef.current.get(message.wordId);
      if (existing && message.updatedAt <= existing.updatedAt) return;
      pendingRef.current.set(message.wordId, {
        value: message.hook,
        updatedAt: message.updatedAt,
      });
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
      // Preserves legacy role→hint mapping: old 'cz' showed czHint, old 'vi'
      // showed viHint. In new terms: 'knownLanguage' (= old 'cz') maps to the
      // from-side hint, 'languageToLearn' (= old 'vi') maps to the to-side hint.
      if (role === 'knownLanguage') return word.czHint || '';
      if (role === 'languageToLearn') return word.viHint || '';
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
    mergeServerMemoryHooks,
  };
}
