'use client';

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'default' | 'warm' | 'calm';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('data-theme', 'default');
    localStorage.setItem('wordlink-theme', 'default');
    if (theme !== 'default') {
      setThemeState('default');
    }
  }, [theme]);

  const setTheme = useCallback((_newTheme: Theme) => setThemeState('default'), []);

  return { theme, setTheme };
}
