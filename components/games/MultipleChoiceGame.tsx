'use client';

import { useState, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';

interface Props {
  words: NormalizedWord[];
  role: 'cz' | 'vi';
  onResult?: (delta: number) => void;
}

export function MultipleChoiceGame({ words, role, onResult }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const questionWord = words[0];
  const getOption = (w: NormalizedWord) => role === 'cz' ? w.vi : w.cz;
  const prompt = role === 'cz' ? questionWord.cz : questionWord.vi;
  const correctAnswer = getOption(questionWord);

  const options = useMemo(
    () => [...words].sort(() => Math.random() - 0.5).map(w => ({
      id: w.id,
      label: getOption(w),
      isCorrect: w.id === questionWord.id,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, role]
  );

  const answered = selected !== null;

  const handleSelect = (optionId: string) => {
    if (answered) return;
    setSelected(optionId);
    const isCorrect = options.find(o => o.id === optionId)?.isCorrect ?? false;
    onResult?.(isCorrect ? 1 : -1);
  };

  return (
    <article className="phrase-card game-card game-card--choice">
      <div className="game-badge">🎯 Choice</div>
      <div className="game-prompt">{prompt}</div>
      <div className="game-options-grid">
        {options.map(opt => {
          let state: 'idle' | 'correct' | 'wrong' | 'reveal' = 'idle';
          if (answered) {
            if (opt.id === selected && opt.isCorrect) state = 'correct';
            else if (opt.id === selected && !opt.isCorrect) state = 'wrong';
            else if (opt.isCorrect) state = 'reveal';
          }
          return (
            <button
              key={opt.id}
              type="button"
              className={`game-option game-option--${state}`}
              onClick={() => handleSelect(opt.id)}
              disabled={answered}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className="game-feedback">
          <span className={options.find(o => o.id === selected)?.isCorrect ? 'game-feedback--exact' : 'game-feedback--wrong'}>
            {options.find(o => o.id === selected)?.isCorrect ? '✓ Correct!' : `✗  ${correctAnswer}`}
          </span>
        </div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
