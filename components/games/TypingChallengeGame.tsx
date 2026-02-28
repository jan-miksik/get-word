'use client';

import { useState } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchAnswer } from '@/lib/minigames';

interface Props {
  words: NormalizedWord[];
  role: 'cz' | 'vi';
  onDismiss: () => void;
  onResult?: (won: boolean) => void;
}

export function TypingChallengeGame({ words, role, onDismiss, onResult }: Props) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'exact' | 'close' | 'wrong' | null>(null);

  const questionWord = words[0];
  const prompt = role === 'cz' ? questionWord.cz : questionWord.vi;
  const correctAnswer = role === 'cz' ? questionWord.vi : questionWord.cz;

  const check = () => {
    if (result !== null || !value.trim()) return;
    setResult(matchAnswer(value, correctAnswer));
  };

  const resultLabels: Record<'exact' | 'close' | 'wrong', string> = {
    exact: '✓ Perfect!',
    close: '~ Close! Watch the diacritics',
    wrong: `✗  ${correctAnswer}`,
  };

  return (
    <article className="phrase-card game-card game-card--typing">
      <div className="game-badge">⌨️ Type it</div>
      <div className="game-prompt">{prompt}</div>
      <div className="game-typing-area">
        <input
          type="text"
          className={`game-input${result ? ` game-input--${result}` : ''}`}
          placeholder="Type translation…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') check(); }}
          disabled={result !== null}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {result === null && (
          <button type="button" className="game-check-btn" onClick={check}>
            Check
          </button>
        )}
      </div>
      {result !== null && (
        <div className={`game-feedback game-feedback--${result}`}>
          {resultLabels[result]}
          <button type="button" className="game-dismiss" onClick={() => { onResult?.(result !== 'wrong'); onDismiss(); }}>
            Next →
          </button>
        </div>
      )}
    </article>
  );
}
