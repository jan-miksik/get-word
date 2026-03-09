'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { syncUserData } from '@/lib/sync';

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
    syncUserData({ game_score: gameScore }).catch((e) =>
      console.error('[useGameScore] sync:', e)
    );
  }, [gameScore, isHydrated]);

  /** Replace local score with server value (e.g. after login/hydration). Never add/sum. */
  const applyServerGameScore = useCallback((score: number) => {
    setGameScore(score);
  }, []);

  return { gameScore, setGameScore, applyServerGameScore };
}
