import { useEffect, useState } from 'react';
import type { LearningLanguage } from '@/features/lists/types';

export function useLearningLanguages(): LearningLanguage[] {
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/languages')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setLanguages(Array.isArray(data.languages) ? data.languages : []);
        }
      })
      .catch(() => {
        if (!cancelled) setLanguages([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return languages;
}
