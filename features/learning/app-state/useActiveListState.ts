'use client';

import { useCallback, useState } from 'react';
import { persistActiveListId, readStoredActiveListId } from './storage';

export function useActiveListState() {
  const [activeListId, setActiveListIdState] = useState<string | null>(() => readStoredActiveListId());

  const setActiveListId = useCallback((id: string | null) => {
    setActiveListIdState(id);
    persistActiveListId(id);
  }, []);

  return {
    activeListId,
    setActiveListId,
  };
}
