'use client';

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'default' | 'warm' | 'calm';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('wordlink-theme') as Theme | null;
    if (saved && ['default', 'warm', 'calm'].includes(saved)) setThemeState(saved);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wordlink-theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => setThemeState(newTheme), []);

  return { theme, setTheme };
}
