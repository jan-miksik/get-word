'use client';

import { useCallback, useState } from 'react';

import { createBrowserId } from '@/lib/browser-id';
import {
  commitSession,
  requestProposal,
  translateSelection,
} from '@/features/word-chat/public.client';
import type { NormalizedWord } from '@/lib/words';

export interface SimilarProposal {
  id: string;
  known: string;
  learning: string;
}

export type SimilarWordsStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'saved' | 'error';

/** Enough for a useful batch without turning the interlude into a work session. */
export const MAX_SIMILAR_SEEDS = 4;
const PER_SEED = 3;

/**
 * Generates confusable neighbours for the words whose distractor pool is thin,
 * and saves the chosen ones into the learner's personal list — without leaving
 * the study surface.
 *
 * It rides the word-chat pipeline rather than growing a parallel generator: the
 * rate limiting, monthly cap, translation quality checks and the commit path
 * into a personal list are all already there. Seeds are batched because the
 * thin-pool words tend to come in groups, one call beats four, and the model
 * writes a more coherent set when it can see them together.
 */
export function useSimilarWords({
  seeds,
  languageFrom,
  languageTo,
  chatLanguage,
  baseListId,
}: {
  seeds: NormalizedWord[];
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  baseListId: string | null;
}) {
  const [status, setStatus] = useState<SimilarWordsStatus>('idle');
  const [proposals, setProposals] = useState<SimilarProposal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedCount, setSavedCount] = useState(0);
  const [session, setSession] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (seeds.length === 0) return;
    const sessionId = createBrowserId('similar');
    setSession(sessionId);
    setStatus('loading');
    try {
      const list = seeds.map((word) => word.cz).filter(Boolean).join(', ');
      const proposal = await requestProposal({
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage,
        // The learner's own level is a chat preference; this interlude has no
        // access to it and should not guess high, so it asks for the floor.
        languageLevel: 'A0',
        contentMode: 'category_inventory',
        messages: [{
          role: 'user',
          content:
            `About ${PER_SEED} words for each of these that are easy to mix up with it — ` +
            `close in meaning, form or sound, and worth knowing on their own: ${list}. ` +
            'Single words or short set phrases only, never sentences.',
        }],
        ...(baseListId ? { baseListId } : {}),
      });

      // Proposals are known-side text only; the pair is made by the translate
      // step, which is also where the quality validators run.
      const wordItems = proposal.items.filter((item) => item.kind === 'word');
      if (wordItems.length === 0) {
        setProposals([]);
        setStatus('error');
        return;
      }
      const translated = await translateSelection({
        sessionId,
        languageFrom,
        languageTo,
        items: wordItems.map((item) => ({
          kind: 'word' as const,
          text: item.text,
          ...(item.source === 'corpus' ? { corpusItemId: item.corpusItemId } : {}),
        })),
      });
      const mapped = translated.items
        .filter((item) => item.text_known.trim() && item.text_target.trim())
        .map((item, index) => ({
          id: `${sessionId}:${index}`,
          known: item.text_known,
          learning: item.text_target,
        }));
      setProposals(mapped);
      setSelected(new Set(mapped.map((item) => item.id)));
      setStatus(mapped.length > 0 ? 'ready' : 'error');
    } catch {
      setStatus('error');
    }
  }, [baseListId, chatLanguage, languageFrom, languageTo, seeds]);

  const toggle = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!session || selected.size === 0) return;
    const chosen = proposals.filter((item) => selected.has(item.id));
    setStatus('saving');
    try {
      await commitSession({
        creationKey: `${session}:commit`,
        sessionId: session,
        languageFrom,
        languageTo,
        chatLanguage,
        ...(baseListId ? { baseListId } : {}),
        listName: '',
        categoryName: '',
        topicLabel: '',
        reviewLabel: '',
        isPublic: false,
        items: chosen.map((item) => ({
          kind: 'word' as const,
          textKnown: item.known,
          textTarget: item.learning,
          audioAssetId: null,
          knownAudioAssetId: null,
        })),
        messages: [],
      });
      setSavedCount(chosen.length);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, [baseListId, chatLanguage, languageFrom, languageTo, proposals, selected, session]);

  return { status, proposals, selected, savedCount, generate, toggle, save };
}
