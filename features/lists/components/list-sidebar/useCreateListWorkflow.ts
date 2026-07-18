'use client';

import { useCallback, useEffect, useState } from 'react';

export function useCreateListWorkflow({
  openSignal,
  initialLanguageFrom,
  initialLanguageTo,
}: {
  openSignal: number;
  initialLanguageFrom?: string | null;
  initialLanguageTo?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [languageFrom, setLanguageFrom] = useState('cs');
  const [languageTo, setLanguageTo] = useState('vi');

  useEffect(() => {
    if (openSignal > 0) setIsOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (initialLanguageFrom) setLanguageFrom(initialLanguageFrom);
    if (initialLanguageTo) setLanguageTo(initialLanguageTo);
  }, [initialLanguageFrom, initialLanguageTo]);

  return {
    isOpen,
    languageFrom,
    languageTo,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
  };
}
