'use client';

import { useCallback, useState } from 'react';

import { createBrowserId } from '@/lib/browser-id';
import { commitSession, requestSimilarWords } from '@/features/word-chat/public.client';
import type { NormalizedWord } from '@/lib/words';

export interface SimilarProposal {
  id: string;
  known: string;
  learning: string;
}

export type SimilarWordsStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'saved' | 'error';

/**
 * Generates the words that are easy to confuse with the one on screen, and
 * saves the chosen ones into the learner's personal list — without leaving the
 * study surface.
 *
 * One seed, two or three neighbours. Batching several thin-pool words into one
 * call used to look like a saving, but the answer then belonged to the batch
 * rather than to the card in front of the learner: asking about "một trăm" came
 * back with words from four other topics. The interlude is about this word.
 *
 * The commit path is the word chat's, because the rate limiting, the monthly
 * cap and the write into a personal list already live there.
 */
export function useSimilarWords({
  seed,
  languageFrom,
  languageTo,
  chatLanguage,
  baseListId,
}: {
  /** The word the learner is looking at; neighbours are found for this one. */
  seed: NormalizedWord | null;
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
    const known = seed?.cz.trim() ?? '';
    const learning = seed?.vi.trim() ?? '';
    if (!known || !learning) return;
    const sessionId = createBrowserId('similar');
    setSession(sessionId);
    setStatus('loading');
    try {
      const response = await requestSimilarWords({
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage,
        seedKnown: known,
        seedTarget: learning,
      });
      const mapped = response.items
        .filter((item) => item.text_known.trim() && item.text_target.trim())
        .map((item, index) => ({
          id: `${sessionId}:${index}`,
          known: item.text_known,
          learning: item.text_target,
        }));
      setProposals(mapped);
      setSelected(new Set(mapped.map((item) => item.id)));
      // No neighbours is a real answer for a word that has none, but there is
      // nothing to show for it, so it lands on the same retry surface.
      setStatus(mapped.length > 0 ? 'ready' : 'error');
    } catch {
      setStatus('error');
    }
  }, [chatLanguage, languageFrom, languageTo, seed]);

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
