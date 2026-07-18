'use client';

import { useState } from 'react';

type WorkflowState = {
  openSignal: number;
  initialLanguageFrom?: string | null;
  initialLanguageTo?: string | null;
  isOpen: boolean;
  languageFrom: string;
  languageTo: string;
};

export function useCreateListWorkflow({
  openSignal,
  initialLanguageFrom,
  initialLanguageTo,
}: {
  openSignal: number;
  initialLanguageFrom?: string | null;
  initialLanguageTo?: string | null;
}) {
  const [stored, setStored] = useState<WorkflowState>(() => ({
    openSignal,
    initialLanguageFrom,
    initialLanguageTo,
    isOpen: openSignal > 0,
    languageFrom: initialLanguageFrom ?? 'cs',
    languageTo: initialLanguageTo ?? 'vi',
  }));

  const inputsChanged =
    stored.openSignal !== openSignal ||
    stored.initialLanguageFrom !== initialLanguageFrom ||
    stored.initialLanguageTo !== initialLanguageTo;
  const state = inputsChanged
    ? {
        ...stored,
        openSignal,
        initialLanguageFrom,
        initialLanguageTo,
        isOpen: openSignal > stored.openSignal ? true : stored.isOpen,
        languageFrom: initialLanguageFrom ?? stored.languageFrom,
        languageTo: initialLanguageTo ?? stored.languageTo,
      }
    : stored;

  return {
    isOpen: state.isOpen,
    languageFrom: state.languageFrom,
    languageTo: state.languageTo,
    open: () => setStored({ ...state, isOpen: true }),
    close: () => setStored({ ...state, isOpen: false }),
  };
}
