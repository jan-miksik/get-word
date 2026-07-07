'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { DemoWord } from './types';

type MatchState = 'idle' | 'selected' | 'matched' | 'wrong';

function buildRightOrder(count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const shuffled = [...order];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const hasCrossing = shuffled.some((value, index) => value !== index);

  if (hasCrossing) return shuffled;
  if (count <= 1) return shuffled;

  return [...order.slice(1), order[0]];
}

/**
 * Compact 3-pair version of the app's matching minigame
 * (components/games/MatchingPairsGame.tsx), scoped to the landing palette.
 * Pairs are identified by their index in the demo word set.
 */
export function DemoMatchingGame({
  words,
  fromLang,
  toLang,
  playWordAudio,
  onComplete,
}: {
  words: DemoWord[];
  fromLang: string;
  toLang: string;
  playWordAudio?: (text: string) => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  // Shuffled once on mount; the parent remounts the game per demo run.
  const [rightOrder] = useState(() => buildRightOrder(words.length));
  const [leftSelected, setLeftSelected] = useState<number | null>(null);
  const [rightSelected, setRightSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [wrongPair, setWrongPair] = useState<[number, number] | null>(null);

  const isComplete = matched.size === words.length;

  function attempt(leftId: number, rightId: number) {
    if (leftId === rightId) {
      playWordAudio?.(words[leftId].back.text);
      setMatched((prev) => new Set([...prev, leftId]));
      setLeftSelected(null);
      setRightSelected(null);
    } else {
      setWrongPair([leftId, rightId]);
      window.setTimeout(() => {
        setWrongPair(null);
        setLeftSelected(null);
        setRightSelected(null);
      }, 600);
    }
  }

  function handleLeft(id: number) {
    if (matched.has(id) || wrongPair) return;
    const next = id === leftSelected ? null : id;
    setLeftSelected(next);
    if (next !== null && rightSelected !== null) attempt(next, rightSelected);
  }

  function handleRight(id: number) {
    if (matched.has(id) || wrongPair) return;
    const next = id === rightSelected ? null : id;
    setRightSelected(next);
    if (leftSelected !== null && next !== null) attempt(leftSelected, next);
  }

  function getState(id: number, side: 'left' | 'right'): MatchState {
    if (matched.has(id)) return 'matched';
    if (side === 'left' ? wrongPair?.[0] === id : wrongPair?.[1] === id) return 'wrong';
    if (side === 'left' ? leftSelected === id : rightSelected === id) return 'selected';
    return 'idle';
  }

  return (
    <div className="lp-demo-match" aria-live="polite">
      <span className="lp-demo-match-badge">🔗 {t('game.match')}</span>
      <div className="lp-demo-match-grid">
        <div className="lp-demo-match-col">
          {words.map((word, id) => {
            const state = getState(id, 'left');
            return (
              <button
                key={id}
                type="button"
                lang={fromLang}
                className={`lp-demo-match-btn lp-demo-match-btn--${state} lp-demo-match-btn--pair${id}`}
                onClick={() => handleLeft(id)}
                disabled={matched.has(id) || !!wrongPair}
              >
                {word.front.text}
              </button>
            );
          })}
        </div>
        <div className="lp-demo-match-col">
          {rightOrder.map((id) => {
            const state = getState(id, 'right');
            return (
              <button
                key={id}
                type="button"
                lang={toLang}
                className={`lp-demo-match-btn lp-demo-match-btn--${state} lp-demo-match-btn--pair${id}`}
                onClick={() => handleRight(id)}
                disabled={matched.has(id) || !!wrongPair}
              >
                {words[id].back.text}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`lp-demo-match-feedback ${isComplete ? 'is-on' : ''}`}>
        {isComplete ? `✓ ${t('game.allMatched')}` : ' '}
      </div>
      {isComplete ? (
        <button
          type="button"
          className="lp-demo-match-continue"
          onClick={onComplete}
          aria-label={t('card.tapToContinue')}
        >
          <span className="lp-demo-match-continue-bar">{t('card.tapToContinue')} →</span>
        </button>
      ) : null}
    </div>
  );
}
