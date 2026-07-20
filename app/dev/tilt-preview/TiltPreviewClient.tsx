'use client';

import { useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { TiltChoiceGame } from '@/features/learning/components/games/TiltChoiceGame';
import type { NormalizedWord } from '@/lib/words';

const WORDS: NormalizedWord[] = [
  {
    id: 'preview-chair',
    category: ['word'],
    languageFrom: 'cs',
    languageTo: 'en',
    cz: 'židle',
    en: '',
    vi: 'chair',
  },
  {
    id: 'preview-word',
    category: ['word'],
    languageFrom: 'cs',
    languageTo: 'en',
    cz: 'slovo',
    en: '',
    vi: 'word',
  },
];

export function TiltPreviewClient() {
  const [round, setRound] = useState(0);
  const [lastDelta, setLastDelta] = useState<number | null>(null);

  return (
    <I18nProvider language="cs">
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#dcd1b9] p-4">
        <div className="w-full max-w-[560px]">
          <TiltChoiceGame
            key={round}
            words={WORDS}
            role="knownLanguage"
            sourceLang="from"
            onResult={setLastDelta}
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--text-soft)]">
          <span data-testid="last-delta">delta: {lastDelta ?? '—'}</span>
          <button
            type="button"
            className="auth-button"
            onClick={() => {
              setLastDelta(null);
              setRound((value) => value + 1);
            }}
          >
            restart
          </button>
        </div>
      </div>
    </I18nProvider>
  );
}
