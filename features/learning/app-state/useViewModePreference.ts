'use client';

import { useCallback, useState } from 'react';
import { persistViewMode, readStoredViewMode } from './storage';
import type { ViewMode } from './types';

export function useViewModePreference() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readStoredViewMode());

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    persistViewMode(mode);
  }, []);

  return {
    viewMode,
    setViewMode,
  };
}
