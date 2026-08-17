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

/**
 * Answers that settle the question rather than fail to reach it: no session,
 * not the owner, no such list. Anything else — 5xx, a timeout, a rate limit —
 * leaves what is already on screen alone.
 */
const ACCESS_DENIED_STATUSES = new Set([401, 403, 404]);

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
  /** Item whose last accept/dismiss did not go through. */
  const [failedItemId, setFailedItemId] = useState<string | null>(null);

  /**
   * Re-read the list's suggestions.
   *
   * Two kinds of failure, and they must not be conflated.
   *
   * A 5xx, a network drop or a bad body says nothing about the learner's
   * access — the honest reading is "no news", so the last known state stays.
   * Emptying on those is what let a rejected accept hide the suggestion
   * anyway: the write returned 500, the re-read that followed also failed, and
   * the notice vanished as though the correction had been applied.
   *
   * The statuses below are the opposite: the server has answered, and the
   * answer is that these suggestions are not this person's to see — the
   * session ended, the list changed hands, or it is gone. Keeping stale rows
   * on screen there would show content access has been explicitly refused.
   * These three are exactly what the route returns; a 429 is deliberately not
   * among them, being a "come back later" rather than a denial.
   */
  const load = useCallback(async () => {
    if (!listId || !enabled) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await deviceJsonFetch(`/api/lists/${listId}/quality-suggestions`);
      if (!response.ok) {
        if (ACCESS_DENIED_STATUSES.has(response.status)) setSuggestions([]);
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
   * Run one accept/dismiss request and clear the suggestion only if the server
   * actually accepted it.
   *
   * `deviceJsonFetch` is a plain fetch wrapper: a 4xx or 5xx resolves, it does
   * not throw. Dropping the suggestion without reading `response.ok` therefore
   * showed the learner a correction as applied when nothing had been saved —
   * and a 409 from a changed suggestion looked exactly like success.
   */
  const runAction = useCallback(
    async (suggestion: QualitySuggestion, request: () => Promise<Response>) => {
      if (!listId) return false;
      setBusyItemId(suggestion.itemId);
      setFailedItemId(null);
      try {
        const response = await request();
        if (!response.ok) {
          setFailedItemId(suggestion.itemId);
          // Re-read rather than guess: a 409 means the suggestion moved on, and
          // the fresh copy is the one worth showing.
          await load();
          return false;
        }
        setSuggestions((previous) =>
          previous.filter((entry) => entry.itemId !== suggestion.itemId),
        );
        return true;
      } catch {
        setFailedItemId(suggestion.itemId);
        return false;
      } finally {
        setBusyItemId(null);
      }
    },
    [listId, load],
  );

  /**
   * Accepting goes through the ordinary translation-edit endpoint, so it
   * behaves exactly as if the learner had retyped the word themselves —
   * including disconnecting audio when the change is more than cosmetic.
   */
  const accept = useCallback(
    (suggestion: QualitySuggestion) =>
      runAction(suggestion, () =>
        deviceJsonFetch(`/api/lists/${listId}/items/translations`, {
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
        }),
      ),
    [listId, runAction],
  );

  /** Declining silences this version only; an improved one comes back. */
  const dismiss = useCallback(
    (suggestion: QualitySuggestion) =>
      runAction(suggestion, () =>
        deviceJsonFetch(`/api/lists/${listId}/quality-suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolKey: suggestion.poolKey,
            suggestionVersion: suggestion.suggestionVersion,
          }),
        }),
      ),
    [listId, runAction],
  );

  return { suggestions, busyItemId, failedItemId, accept, dismiss, reload: load };
}
