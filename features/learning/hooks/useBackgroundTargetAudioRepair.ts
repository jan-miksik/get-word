'use client';

import { useEffect } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { apiFetch } from '@/features/shared/http/api-runtime';

const TARGET_AUDIO_REPAIR_COUNT = 5;
const RETRY_AFTER_MS = 10 * 60_000;

type RepairState = {
  attemptedAt: number;
  promise?: Promise<void>;
};

// Module scope is intentional: remounting the study surface must not turn a
// navigation between Study / Add words / Photo Lab into another TTS batch.
const repairStateByItem = new Map<string, RepairState>();

function hasAudio(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.some((entry) => Boolean(entry?.trim())) : Boolean(value?.trim());
}

function isRecentlyAttempted(itemId: string, now: number): boolean {
  const state = repairStateByItem.get(itemId);
  return Boolean(state && now - state.attemptedAt < RETRY_AFTER_MS);
}

async function repairMissingTargetAudio(
  words: NormalizedWord[],
  onRefresh: () => Promise<void>,
): Promise<void> {
  const now = Date.now();
  const candidates = words
    .filter((word) => {
      // A URL means the item already has a durable audio asset. Do not probe
      // Arweave here: a gateway outage is a playback concern, not a TTS request.
      if (hasAudio(word.viAudio)) return false;
      if (!word.vi.trim() || !word.languageTo?.trim() || !word.listId) return false;
      return !isRecentlyAttempted(word.id, now);
    })
    .slice(0, TARGET_AUDIO_REPAIR_COUNT);

  if (candidates.length === 0) return;

  const existingRequest = candidates.some((word) => repairStateByItem.get(word.id)?.promise);
  if (existingRequest) return;

  for (const word of candidates) {
    repairStateByItem.set(word.id, { attemptedAt: now });
  }

  const promise = (async () => {
    try {
      const response = await apiFetch('/api/audio/generate/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: candidates.map((word) => ({
            id: word.id,
            text: word.vi,
            language: word.languageTo,
          })),
          provider: 'google_tts',
          audio_field: 'target',
          allow_partial: true,
          allow_partial_auth: true,
        }),
      });

      // 403/429/5xx are deliberately just a failed background repair. The
      // cooldown prevents a render/refetch loop from repeatedly billing Google.
      if (!response.ok) return;
      const payload = (await response.json().catch(() => null)) as {
        results?: Array<{ id?: string; status?: string }>;
      } | null;
      const generated = payload?.results?.some((result) => result.status === 'ok');
      if (generated) await onRefresh();
    } catch {
      // Background repair must never interfere with studying or surface changes.
    } finally {
      for (const word of candidates) {
        const state = repairStateByItem.get(word.id);
        if (state) repairStateByItem.set(word.id, { attemptedAt: state.attemptedAt });
      }
    }
  })();

  for (const word of candidates) {
    repairStateByItem.set(word.id, { attemptedAt: now, promise });
  }
  return promise;
}

type Options = {
  words: NormalizedWord[];
  enabled: boolean;
  onRefresh: () => Promise<void>;
};

export function useBackgroundTargetAudioRepair({ words, enabled, onRefresh }: Options): void {
  useEffect(() => {
    if (!enabled || words.length === 0) return;
    void repairMissingTargetAudio(words, onRefresh);
  }, [enabled, onRefresh, words]);
}

export function resetBackgroundTargetAudioRepairForTests(): void {
  repairStateByItem.clear();
}
