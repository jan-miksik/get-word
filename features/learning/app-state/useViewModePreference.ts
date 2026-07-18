'use client';

import { useCallback, useState } from 'react';
import { persistViewMode, readStoredViewMode } from './storage';
import type { ViewMode } from './types';

export function useViewModePreference() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readStoredViewMode());

  const setViewMode = useCallback((mode: ViewMode) => {
    // Card is currently the only enabled view. Keep accepting the canonical
    // setter argument so callers do not need a compatibility adapter.
    void mode;
    setViewModeState('card');
    persistViewMode('card');
  }, []);

  return {
    viewMode,
    setViewMode,
  };
}
