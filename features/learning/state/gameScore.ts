'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { debouncedSync } from '@/lib/sync';

export function useGameScore(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [gameScore, setGameScore] = useState(0);
  const gameScoreSyncedRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!gameScoreSyncedRef.current) {
      gameScoreSyncedRef.current = true;
      return;
    }
    debouncedSync({ game_score: gameScore }).catch((e) =>
      console.error('[useGameScore] sync:', e)
    );
  }, [gameScore, isHydrated, isUpdatingFromServerRef]);

  const applyServerGameScore = useCallback((score: number) => {
    setGameScore(score);
  }, []);

  return { gameScore, setGameScore, applyServerGameScore };
}
