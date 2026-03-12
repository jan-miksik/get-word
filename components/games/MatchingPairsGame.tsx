'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { NormalizedWord } from '@/lib/words';

interface Props {
  words: NormalizedWord[];
  role: 'cz' | 'vi';
  onResult?: (delta: number) => void;
}

type MatchState = 'idle' | 'selected' | 'matched' | 'wrong';
type MatchColor = 1 | 2 | 3 | 4;

export function MatchingPairsGame({ words, role, onResult }: Props) {
  const rightOrder = useMemo(
    () => [...words].sort(() => Math.random() - 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words]
  );

  const [leftSelected, setLeftSelected] = useState<string | null>(null);
  const [rightSelected, setRightSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [matchColors, setMatchColors] = useState<Map<string, MatchColor>>(() => new Map());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);

  const getLeft = (w: NormalizedWord) => role === 'cz' ? w.cz : w.vi;
  const getRight = (w: NormalizedWord) => role === 'cz' ? w.vi : w.cz;

  const isComplete = matched.size === words.length;
  const resultFired = useRef(false);

  useEffect(() => {
    if (isComplete && !resultFired.current) {
      resultFired.current = true;
      onResult?.(1);
    }
  }, [isComplete, onResult]);

  const attempt = (lId: string, rId: string) => {
    if (lId === rId) {
      setMatchColors(prev => {
        if (prev.has(lId)) return prev;
        const next = new Map(prev);
        const nextColor = ((prev.size % 4) + 1) as MatchColor;
        next.set(lId, nextColor);
        return next;
      });
      setMatched(prev => new Set([...prev, lId]));
      setLeftSelected(null);
      setRightSelected(null);
    } else {
      setWrongPair([lId, rId]);
      setTimeout(() => {
        setWrongPair(null);
        setLeftSelected(null);
        setRightSelected(null);
      }, 600);
    }
  };

  const handleLeft = (id: string) => {
    if (matched.has(id) || wrongPair) return;
    const next = id === leftSelected ? null : id;
    setLeftSelected(next);
    if (next && rightSelected) attempt(next, rightSelected);
  };

  const handleRight = (id: string) => {
    if (matched.has(id) || wrongPair) return;
    const next = id === rightSelected ? null : id;
    setRightSelected(next);
    if (leftSelected && next) attempt(leftSelected, next);
  };

  const getLeftState = (id: string): MatchState => {
    if (matched.has(id)) return 'matched';
    if (wrongPair?.[0] === id) return 'wrong';
    if (leftSelected === id) return 'selected';
    return 'idle';
  };

  const getRightState = (id: string): MatchState => {
    if (matched.has(id)) return 'matched';
    if (wrongPair?.[1] === id) return 'wrong';
    if (rightSelected === id) return 'selected';
    return 'idle';
  };

  const getMatchColorClass = (id: string, state: MatchState) => {
    if (state !== 'matched') return '';
    const color = matchColors.get(id);
    return color ? ` game-match-btn--c${color}` : '';
  };

  return (
    <article className="phrase-card game-card game-card--matching">
      <div className="game-badge">🔗 Match</div>

      <div className="game-match-grid">
        <div className="game-match-col">
          {words.map(w => {
            const state = getLeftState(w.id);
            return (
              <button
                key={w.id}
                type="button"
                className={`game-match-btn game-match-btn--${state}${getMatchColorClass(w.id, state)}`}
                onClick={() => handleLeft(w.id)}
                disabled={matched.has(w.id) || !!wrongPair}
              >
                {getLeft(w)}
              </button>
            );
          })}
        </div>
        <div className="game-match-col">
          {rightOrder.map(w => {
            const state = getRightState(w.id);
            return (
              <button
                key={w.id}
                type="button"
                className={`game-match-btn game-match-btn--${state}${getMatchColorClass(w.id, state)}`}
                onClick={() => handleRight(w.id)}
                disabled={matched.has(w.id) || !!wrongPair}
              >
                {getRight(w)}
              </button>
            );
          })}
        </div>
      </div>

      {isComplete ? (
        <div className="game-feedback game-feedback--exact">✓ All matched!</div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
