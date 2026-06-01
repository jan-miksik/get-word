'use client';

import { useEffect, useState } from 'react';
import type { Word } from '@/lib/words';
import { stripLegacyLocalSpeechAudioFromWord } from '@/lib/words';

export function useWordsLoader() {
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
        setWords(
          Array.isArray(data.words)
            ? data.words.map(stripLegacyLocalSpeechAudioFromWord)
            : [],
        );
      })
      .catch(() => {
        setWords([]);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setIsLoading(false);
      });
  }, []);

  return { words, setWords, isLoading };
}
