'use client';

import { useEffect, useState } from 'react';
import type { SupportedLearningLanguage } from './types';
import { apiFetch } from '@/features/shared/http/api-runtime';

type SupportedLanguagesState = {
  languages: SupportedLearningLanguage[];
  loading: boolean;
};

export function useSupportedLanguages(): SupportedLanguagesState {
  const [state, setState] = useState<SupportedLanguagesState>({
    languages: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    apiFetch('/api/languages')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setState({
            languages: Array.isArray(data.languages) ? data.languages : [],
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ languages: [], loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
