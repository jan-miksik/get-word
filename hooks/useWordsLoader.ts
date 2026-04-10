'use client';

import { useState, useEffect } from 'react';
import { WORDS } from '@/data/words';
import { Word } from '@/data/words';

export function useWordsLoader() {
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const shouldLogPerf = process.env.NEXT_PUBLIC_DEBUG_TIMING === '1';
    const startedAt = performance.now();
    const defaultWords = WORDS.map((w) => ({ ...w, category: [...w.category] })) as Word[];
    const WORDS_FETCH_TIMEOUT_MS = 30_000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORDS_FETCH_TIMEOUT_MS);

    fetch('/api/words', { signal: controller.signal })
      .then((res) => {
        if (shouldLogPerf) {
          const serverTiming = res.headers.get('server-timing');
          if (serverTiming) {
            console.info(`[timing] /api/words server-timing: ${serverTiming}`);
          }
        }
        if (!res.ok) {
          throw new Error(`Words API ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.words && Array.isArray(data.words) && data.words.length > 0) {
          setWords(data.words);
        } else {
          setWords(defaultWords);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          console.warn('[useWordsLoader] Words fetch timeout, using local fallback');
        } else {
          console.warn('[useWordsLoader] Words fetch failed, using local fallback:', err);
        }
        setWords(defaultWords);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setIsLoading(false);
        if (shouldLogPerf) {
          console.info(`[timing] useWordsLoader.total ${(performance.now() - startedAt).toFixed(1)}ms`);
        }
      });
  }, []);

  return { words, setWords, isLoading };
}
