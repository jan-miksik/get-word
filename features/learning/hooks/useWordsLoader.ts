'use client';

import { useEffect, useState } from 'react';
import { WORDS, type Word } from '@/data/words';

export function useWordsLoader() {
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const defaultWords = WORDS.map((word) => ({ ...word, category: [...word.category] })) as Word[];
    const WORDS_FETCH_TIMEOUT_MS = 30_000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORDS_FETCH_TIMEOUT_MS);

    fetch('/api/words', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Words API ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.words && Array.isArray(data.words) && data.words.length > 0) {
          setWords(data.words);
          return;
        }
        setWords(defaultWords);
      })
      .catch(() => {
        setWords(defaultWords);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setIsLoading(false);
      });
  }, []);

  return { words, setWords, isLoading };
}
