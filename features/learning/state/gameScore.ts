'use client';

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { enqueueOp } from '@/lib/local-first/enqueue';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';

export function useGameScore(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [gameScore, setGameScoreState] = useState(0);
  const gameScoreSyncedRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!gameScoreSyncedRef.current) {
      gameScoreSyncedRef.current = true;
      return;
    }
    void enqueueOp({
      entity: 'game_score',
      opType: 'max',
      payload: { score: gameScore },
      legacyPayload: { game_score: gameScore },
    }).catch((e) => console.error('[useGameScore] enqueue:', e));
  }, [gameScore, isHydrated, isUpdatingFromServerRef]);

  const applyServerGameScore = useCallback((score: number) => {
    setGameScoreState((prev) => Math.max(prev, score));
  }, []);

  const setGameScore = useCallback<Dispatch<SetStateAction<number>>>((value) => {
    setGameScoreState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const normalized = Math.max(0, Math.floor(next));
      postTabMessage({ type: 'game_score_changed', score: normalized });
      return normalized;
    });
  }, []);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'game_score_changed') return;
      setGameScoreState((prev) => Math.max(prev, message.score));
    });
  }, []);

  return { gameScore, setGameScore, applyServerGameScore };
}
