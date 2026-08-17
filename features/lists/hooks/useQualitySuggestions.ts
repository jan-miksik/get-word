'use client';

import { useCallback, useEffect, useState } from 'react';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';

export type QualitySuggestion = {
  itemId: string;
  poolKey: string;
  suggestionVersion: number;
  currentTarget: string;
  suggestedKnown: string | null;
  suggestedTarget: string | null;
  note: string | null;
};

type WireSuggestion = {
  item_id: string;
  pool_key: string;
  suggestion_version: number;
  current_target: string;
  suggested_known: string | null;
  suggested_target: string | null;
  note: string | null;
};

/**
 * Correction suggestions for one list, fetched on its own rather than through
 * `/api/sync`.
 *
 * They are shown only in the list editor, so folding them into the sync
 * payload would cost every client bandwidth and force a content-revision bump
 * for an editor's note most people will never see.
 */
export function useQualitySuggestions(listId: string | null, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<QualitySuggestion[]>([]);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!listId || !enabled) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await deviceJsonFetch(`/api/lists/${listId}/quality-suggestions`);
      if (!response.ok) {
        setSuggestions([]);
        return;
      }
      const body = (await response.json()) as { suggestions?: WireSuggestion[] };
      setSuggestions(
        (body.suggestions ?? []).map((entry) => ({
          itemId: entry.item_id,
          poolKey: entry.pool_key,
          suggestionVersion: entry.suggestion_version,
          currentTarget: entry.current_target,
          suggestedKnown: entry.suggested_known,
          suggestedTarget: entry.suggested_target,
          note: entry.note,
        })),
      );
    } catch {
      // A suggestion is an optional nicety; never let it break the editor.
      setSuggestions([]);
    }
  }, [listId, enabled]);

  useEffect(() => {
    // Deferred by a tick so the first state update never lands synchronously
    // inside the effect. Same idiom as `features/admin/client/useAdminStats`.
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  /**
   * Accepting goes through the ordinary translation-edit endpoint, so it
   * behaves exactly as if the learner had retyped the word themselves —
   * including disconnecting audio when the change is more than cosmetic.
   */
  const accept = useCallback(
    async (suggestion: QualitySuggestion) => {
      if (!listId) return;
      setBusyItemId(suggestion.itemId);
      try {
        await deviceJsonFetch(`/api/lists/${listId}/items/translations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            translations: [
              {
                id: suggestion.itemId,
                ...(suggestion.suggestedTarget !== null
                  ? { text_target: suggestion.suggestedTarget }
                  : {}),
                ...(suggestion.suggestedKnown !== null
                  ? { text_known: suggestion.suggestedKnown }
                  : {}),
              },
            ],
          }),
        });
        // The edit changes the pair, so the suggestion no longer matches it.
        setSuggestions((previous) =>
          previous.filter((entry) => entry.itemId !== suggestion.itemId),
        );
      } finally {
        setBusyItemId(null);
      }
    },
    [listId],
  );

  /** Declining silences this version only; an improved one comes back. */
  const dismiss = useCallback(
    async (suggestion: QualitySuggestion) => {
      if (!listId) return;
      setBusyItemId(suggestion.itemId);
      try {
        await deviceJsonFetch(`/api/lists/${listId}/quality-suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolKey: suggestion.poolKey,
            suggestionVersion: suggestion.suggestionVersion,
          }),
        });
        setSuggestions((previous) =>
          previous.filter((entry) => entry.itemId !== suggestion.itemId),
        );
      } finally {
        setBusyItemId(null);
      }
    },
    [listId],
  );

  return { suggestions, busyItemId, accept, dismiss, reload: load };
}
