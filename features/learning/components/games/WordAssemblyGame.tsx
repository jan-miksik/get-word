'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { getWordTextBySide, knownSideForRole } from './types';
import { SuccessMarkSlot } from './SuccessMark';

export type AssemblyOutcome = 'known' | 'unknown';

type Tile = { id: string; value: string; correctIndex: number | null };

function seededShuffle<T>(items: T[], seed: string): T[] {
  const output = [...items];
  let state = 0;
  for (const character of seed) state = ((state << 5) - state + character.charCodeAt(0)) | 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b) | 0;
    const swap = Math.abs(state) % (index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

export function WordAssemblyGame({
  word,
  role,
  variant,
  answerParts,
  distractorParts,
  onOutcome,
}: {
  word: NormalizedWord;
  role: LearningRole;
  variant: string;
  answerParts: string[];
  distractorParts: string[];
  onOutcome: (outcome: AssemblyOutcome) => void;
}) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<AssemblyOutcome | null>(null);
  const tiles = useMemo<Tile[]>(() => seededShuffle([
    ...answerParts.map((value, index) => ({ id: `correct-${index}`, value, correctIndex: index })),
    ...distractorParts.map((value, index) => ({ id: `extra-${index}`, value, correctIndex: null })),
  ], `${word.id}:${variant}`), [answerParts, distractorParts, variant, word.id]);
  const selectedTiles = chosen.map((id) => tiles.find((tile) => tile.id === id)).filter(Boolean) as Tile[];

  const choose = (tile: Tile) => {
    if (outcome || chosen.includes(tile.id)) return;
    const next = [...chosen, tile.id];
    setChosen(next);
    if (next.length !== answerParts.length) return;
    const isCorrect = next.every((id, index) => id === `correct-${index}`);
    setOutcome(isCorrect ? 'known' : 'unknown');
  };

  const reset = () => {
    if (outcome) return;
    setChosen([]);
  };

  return (
    <article className="study-ink-scope relative mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-3 py-6 text-center">
      <SuccessMarkSlot show={outcome === 'known'} label={t('game.correct')} rollKey={word.id} />
      <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-text-soft">
        {t('game.assemble')}
      </p>
      <div {...noTranslateProps('text-2xl font-extrabold text-text sm:text-3xl')}>
        {getWordTextBySide(word, knownSideForRole(role))}
      </div>
      <div className="flex min-h-14 flex-wrap justify-center gap-2" aria-label={t('game.assembledAnswer')}>
        {selectedTiles.map((tile, index) => (
          <span
            key={tile.id}
            {...noTranslateProps('rounded-xl border-2 border-accent/50 bg-accent/10 px-3 py-2 text-lg font-bold text-text')}
          >
            {tile.value}{variant.startsWith('letters') && index < selectedTiles.length - 1 ? '' : ''}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={Boolean(outcome) || chosen.includes(tile.id)}
            {...noTranslateProps('rounded-xl border-2 border-border-subtle bg-background-elevated px-3 py-2 text-lg font-bold text-text transition hover:border-accent disabled:cursor-default disabled:opacity-35')}
            onClick={() => choose(tile)}
          >
            {tile.value}
          </button>
        ))}
      </div>
      {!outcome && chosen.length > 0 && (
        <button type="button" onClick={reset} className="text-xs font-bold text-text-soft underline">
          {t('game.clear')}
        </button>
      )}
      {outcome && (
        <div className={outcome === 'known' ? 'text-sm font-bold text-emerald-700' : 'text-sm font-bold text-rose-700'}>
          {outcome === 'known'
            ? null
            : `✗ ${answerParts.join(variant.startsWith('letters') ? '' : ' ')}`}
          <button
            type="button"
            className="ml-4 rounded-xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-2 text-sm font-bold text-[#F4EFE2]"
            onClick={() => onOutcome(outcome)}
          >
            →
          </button>
        </div>
      )}
    </article>
  );
}
