'use client';

import { useState, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';

interface Props {
  words: NormalizedWord[];
  role: 'cz' | 'vi';
  onDismiss: () => void;
  onResult?: (won: boolean) => void;
}

type MatchState = 'idle' | 'selected' | 'matched' | 'wrong';

export function MatchingPairsGame({ words, role, onDismiss, onResult }: Props) {
  const rightOrder = useMemo(
    () => [...words].sort(() => Math.random() - 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words]
  );

  const [leftSelected, setLeftSelected] = useState<string | null>(null);
  const [rightSelected, setRightSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);

  const getLeft = (w: NormalizedWord) => role === 'cz' ? w.cz : w.vi;
  const getRight = (w: NormalizedWord) => role === 'cz' ? w.vi : w.cz;

  const isComplete = matched.size === words.length;

  const attempt = (lId: string, rId: string) => {
    if (lId === rId) {
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

  return (
    <article className="phrase-card game-card game-card--matching">
      <div className="game-badge">🔗 Match</div>

      <div className="game-match-grid">
        <div className="game-match-col">
          {words.map(w => (
            <button
              key={w.id}
              type="button"
              className={`game-match-btn game-match-btn--${getLeftState(w.id)}`}
              onClick={() => handleLeft(w.id)}
              disabled={matched.has(w.id) || !!wrongPair}
            >
              {getLeft(w)}
            </button>
          ))}
        </div>
        <div className="game-match-col">
          {rightOrder.map(w => (
            <button
              key={w.id}
              type="button"
              className={`game-match-btn game-match-btn--${getRightState(w.id)}`}
              onClick={() => handleRight(w.id)}
              disabled={matched.has(w.id) || !!wrongPair}
            >
              {getRight(w)}
            </button>
          ))}
        </div>
      </div>

      {isComplete && (
        <div className="game-feedback game-feedback--exact">
          ✓ All matched!
          <button type="button" className="game-dismiss" onClick={() => { onResult?.(true); onDismiss(); }}>
            Next →
          </button>
        </div>
      )}
    </article>
  );
}
