'use client';

import { useState, useSyncExternalStore } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { WordAssemblyGame } from '@/features/learning/components/games/WordAssemblyGame';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { NormalizedWord } from '@/lib/words';

/**
 * Dev harness for "sestav odpověď": `/dev/assembly`.
 *
 * The round sits behind a per-stage method draw, so the one part that keeps
 * needing a second look — dragging a placed tile past its neighbours — is hard
 * to reach in a real session.
 */

const WORD: NormalizedWord = {
  id: 'assembly-preview',
  category: ['word'],
  languageFrom: 'cs',
  languageTo: 'vi',
  cz: 'kolik to stojí dohromady',
  en: '',
  vi: 'tất cả bao nhiêu tiền',
};

const ROUNDS = {
  words: { answer: ['tất', 'cả', 'bao', 'nhiêu', 'tiền'], extra: ['rồi', 'nhé'] },
  letters: { answer: ['n', 'ư', 'ớ', 'c'], extra: ['g', 'h'] },
} as const;

const subscribeToHydration = () => () => {};

export function AssemblyPreviewClient() {
  const [variant, setVariant] = useState<keyof typeof ROUNDS>('words');
  const [role, setRole] = useState<LearningRole>('knownLanguage');
  const [round, setRound] = useState(0);
  const [outcome, setOutcome] = useState<string>('—');

  // The tiles are shuffled on first render, so server and client markup never
  // agree; mount-gating keeps real console errors visible.
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const config = ROUNDS[variant];

  return (
    <I18nProvider language="cs">
      <div className="flex min-h-[100dvh] flex-col bg-sand">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs text-ink">
          <span className="font-bold uppercase tracking-wider">sestav odpověď</span>
          {(Object.keys(ROUNDS) as Array<keyof typeof ROUNDS>).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setVariant(value);
                setRound((r) => r + 1);
              }}
              className={`rounded-md border px-2 py-1 font-bold ${
                variant === value ? 'border-black/50 bg-white' : 'border-black/20'
              }`}
            >
              {value === 'words' ? 'slova' : 'písmena'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setRole((value) => (value === 'knownLanguage' ? 'languageToLearn' : 'knownLanguage'));
              setRound((r) => r + 1);
            }}
            className="rounded-md border border-black/20 px-2 py-1 font-bold"
          >
            {role === 'knownLanguage' ? 'cs → vi' : 'vi → cs'}
          </button>
          <button
            type="button"
            onClick={() => setRound((r) => r + 1)}
            className="rounded-md border border-black/20 px-2 py-1 font-bold"
          >
            restart
          </button>
          <span className="ml-auto font-bold" data-testid="preview-outcome">
            výsledek {outcome}
          </span>
        </div>

        <div className="flex-1 px-3 py-6">
          {mounted && (
            <WordAssemblyGame
              key={`${round}:${variant}:${role}`}
              word={WORD}
              role={role}
              variant={variant === 'letters' ? 'letters:II' : 'words'}
              answerParts={[...config.answer]}
              distractorParts={[...config.extra]}
              stageIndex={3}
              onOutcome={(value) => {
                setOutcome(value);
                setRound((r) => r + 1);
              }}
            />
          )}
        </div>
      </div>
    </I18nProvider>
  );
}
