'use client';

import { useEffect, useState } from 'react';
import type { Word } from '@/lib/words';
import { loadWords } from '@/features/learning/data/wordsCache';

export function useWordsLoader() {
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Resolves on the next microtask when the list is already cached, so
    // remounts — notably landing on the app post-login — skip the multi-second
    // /api/words round-trip.
    loadWords()
      .then((data) => {
        if (active) setWords(data);
      })
      .catch(() => {
        if (active) setWords([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { words, setWords, isLoading };
}
