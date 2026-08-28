'use client';

import { useState, useSyncExternalStore } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { MatchingPairsGame } from '@/features/learning/components/games/MatchingPairsGame';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { NormalizedWord } from '@/lib/words';

/**
 * Dev harness for the matching board: `/dev/matching`.
 *
 * The round is otherwise buried a few cards into a session, which makes the
 * part that needs repeated looking at — how a settled pair colours itself next
 * to the pairs still in play — impossible to iterate on.
 */

type Pair = { from: string; to: string };

const SHORT_PAIRS: Pair[] = [
  { from: 'pes', to: 'con chó' },
  { from: 'kočka', to: 'con mèo' },
  { from: 'voda', to: 'nước' },
  { from: 'chléb', to: 'bánh mì' },
  { from: 'dům', to: 'nhà' },
  { from: 'děkuji', to: 'cảm ơn' },
];

const LONG_PAIRS: Pair[] = [
  { from: 'nerozumím vám dobře', to: 'tôi không hiểu rõ' },
  { from: 'na shledanou zítra ráno', to: 'hẹn gặp lại sáng mai' },
  { from: 'kolik to stojí dohromady', to: 'tất cả bao nhiêu tiền' },
  { from: 'chtěl bych si objednat kávu', to: 'tôi muốn gọi một ly cà phê' },
  { from: 'můžete mi prosím pomoci', to: 'bạn có thể giúp tôi không' },
  { from: 'kde si mohu koupit jízdenku', to: 'tôi có thể mua vé ở đâu' },
];

function buildWords(count: number, long: boolean): NormalizedWord[] {
  const source = long ? LONG_PAIRS : SHORT_PAIRS;
  return source.slice(0, count).map((pair, index) => ({
    id: `match-${long ? 'long' : 'short'}-${index}`,
    category: ['word'],
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: pair.from,
    en: '',
    vi: pair.to,
  }));
}

const COUNTS = [3, 4, 5, 6];
const subscribeToHydration = () => () => {};

export function MatchingPreviewClient() {
  const [count, setCount] = useState(4);
  const [long, setLong] = useState(false);
  const [role, setRole] = useState<LearningRole>('knownLanguage');
  const [frameless, setFrameless] = useState(true);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  // The board shuffles its right column on first render, so server and client
  // markup never agree. Mount-gating it keeps the harness free of hydration
  // noise that would otherwise hide real console errors.
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  const words = buildWords(count, long);
  const restart = () => {
    setScore(0);
    setRound((value) => value + 1);
  };

  return (
    <I18nProvider language="cs">
      <div className="flex min-h-[100dvh] flex-col bg-[#dcd1b9]">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs text-[#2A2218]">
          <span className="font-bold uppercase tracking-wider">párování</span>
          {COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setCount(value);
                restart();
              }}
              className={`rounded-md border px-2 py-1 font-bold ${
                count === value ? 'border-black/50 bg-white' : 'border-black/20'
              }`}
            >
              {value} párů
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setLong((value) => !value);
              restart();
            }}
            className={`rounded-md border px-2 py-1 font-bold ${
              long ? 'border-black/50 bg-white' : 'border-black/20'
            }`}
          >
            dlouhá slova
          </button>
          <button
            type="button"
            onClick={() => {
              setRole((value) => (value === 'knownLanguage' ? 'languageToLearn' : 'knownLanguage'));
              restart();
            }}
            className="rounded-md border border-black/20 px-2 py-1 font-bold"
          >
            {role === 'knownLanguage' ? 'cs → vi' : 'vi → cs'}
          </button>
          <button
            type="button"
            onClick={() => setFrameless((value) => !value)}
            className={`rounded-md border px-2 py-1 font-bold ${
              frameless ? 'border-black/50 bg-white' : 'border-black/20'
            }`}
          >
            bez rámu
          </button>
          <button type="button" onClick={restart} className="rounded-md border border-black/20 px-2 py-1 font-bold">
            restart
          </button>
          <span className="ml-auto font-bold" data-testid="preview-score">
            skóre {score}
          </span>
        </div>

        <div className="flex-1 px-3 py-6">
          {mounted && <MatchingPairsGame
            key={`${round}:${count}:${long}:${role}:${frameless}`}
            words={words}
            role={role}
            frameless={frameless}
            onResult={(delta) => setScore((value) => value + delta)}
          />}
        </div>
      </div>
    </I18nProvider>
  );
}
