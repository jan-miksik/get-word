'use client';

import { useCallback, useMemo, useState } from 'react';

import type { Word } from '@/data/words';
import { getDeviceId } from '@/lib/device-id';

type UseEditableWordsArgs = {
  words: Word[];
  setWords: React.Dispatch<React.SetStateAction<Word[]>>;
};

export function useEditableWords({ words, setWords }: UseEditableWordsArgs) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const wordIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    words.forEach((word, index) => map.set(word.id, index));
    return map;
  }, [words]);

  const updateWord = useCallback(
    (wordId: string, updater: (word: Word) => Word) => {
      const index = wordIndexMap.get(wordId);
      if (index === undefined) return;

      setWords((previousWords) => {
        const updatedWords = [...previousWords];
        updatedWords[index] = updater({ ...updatedWords[index] });
        return updatedWords;
      });
    },
    [setWords, wordIndexMap],
  );

  const handleWordFieldChange = useCallback(
    (wordId: string, field: keyof Word, value: string | string[]) => {
      updateWord(wordId, (word) => {
        (word as unknown as Record<string, string | string[]>)[field as string] = value;
        return word;
      });
    },
    [updateWord],
  );

  const handleCategoryAdd = useCallback(
    (wordId: string, category: string) => {
      updateWord(wordId, (word) => {
        const categories = [...(word.category || [])];
        if (!categories.includes(category)) {
          word.category = [...categories, category];
        }
        return word;
      });
    },
    [updateWord],
  );

  const handleCategoryRemove = useCallback(
    (wordId: string, category: string) => {
      updateWord(wordId, (word) => {
        const categories = [...(word.category || [])];
        const index = categories.indexOf(category);
        if (index >= 0) {
          categories.splice(index, 1);
          word.category = categories;
        }
        return word;
      });
    },
    [updateWord],
  );

  const handleCategoryToggle = useCallback(
    (wordId: string, category: string) => {
      updateWord(wordId, (word) => {
        const categories = [...(word.category || [])];
        const index = categories.indexOf(category);
        if (index >= 0) categories.splice(index, 1);
        else categories.push(category);
        word.category = categories;
        return word;
      });
    },
    [updateWord],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId(),
        },
        body: JSON.stringify({ words }),
      });
      const data = await response.json();
      if (data.success) {
        setSaveMessage('Saved successfully!');
        window.setTimeout(() => setSaveMessage(null), 2000);
      } else {
        setSaveMessage(`Error: ${data.error || 'Failed to save'}`);
      }
    } catch (error) {
      setSaveMessage(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`);
    } finally {
      setIsSaving(false);
    }
  }, [words]);

  return {
    handleCategoryAdd,
    handleCategoryRemove,
    handleCategoryToggle,
    handleSave,
    handleWordFieldChange,
    isSaving,
    saveMessage,
  };
}
