'use client';

import { useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { BubbleChoiceGame } from '@/features/learning/components/games/BubbleChoiceGame';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { NormalizedWord } from '@/lib/words';

/**
 * Dev harness for the bubble field: `/dev/bubbles`.
 *
 * The game is otherwise only reachable a few words into a real session, which
 * makes the parts that need repeated looking at — drift, collisions, the burst,
 * the field's behaviour on a narrow viewport — impossible to iterate on. The
 * long-word set is deliberately awkward: it is the case that used to push
 * bubbles off the screen on a phone.
 */

type Pair = { from: string; to: string };

const SHORT_PAIRS: Pair[] = [
  { from: 'pes', to: 'con chó' },
  { from: 'kočka', to: 'con mèo' },
  { from: 'voda', to: 'nước' },
  { from: 'chléb', to: 'bánh mì' },
  { from: 'dům', to: 'nhà' },
  { from: 'škola', to: 'trường học' },
  { from: 'ráno', to: 'buổi sáng' },
  { from: 'nádraží', to: 'nhà ga' },
  { from: 'jízdenka', to: 'vé' },
  { from: 'děkuji', to: 'cảm ơn' },
  { from: 'promiň', to: 'xin lỗi' },
  { from: 'zítra', to: 'ngày mai' },
];

const LONG_PAIRS: Pair[] = [
  { from: 'Kde je nejbližší zastávka autobusu?', to: 'Trạm xe buýt gần nhất ở đâu?' },
  { from: 'Mohl byste to prosím zopakovat pomaleji?', to: 'Bạn có thể nhắc lại chậm hơn không?' },
  { from: 'nerozumím vám dobře', to: 'tôi không hiểu rõ' },
  { from: 'na shledanou zítra ráno', to: 'hẹn gặp lại sáng mai' },
  { from: 'kolik to stojí dohromady', to: 'tất cả bao nhiêu tiền' },
  { from: 'promiňte, hledám nádraží', to: 'xin lỗi, tôi đang tìm nhà ga' },
  { from: 'chtěl bych si objednat kávu', to: 'tôi muốn gọi một ly cà phê' },
  { from: 'můžete mi prosím pomoci', to: 'bạn có thể giúp tôi không' },
  { from: 'dnes je opravdu hezky', to: 'hôm nay trời rất đẹp' },
  { from: 'kde si mohu koupit jízdenku', to: 'tôi có thể mua vé ở đâu' },
];

function buildWords(count: number, long: boolean): NormalizedWord[] {
  const source = long ? LONG_PAIRS : SHORT_PAIRS;
  return source.slice(0, count).map((pair, index) => ({
    id: `bubble-${long ? 'long' : 'short'}-${index}`,
    category: ['word'],
    languageFrom: 'cs',
    languageTo: 'vi',
    cz: pair.from,
    en: '',
    vi: pair.to,
  }));
}

const COUNTS = [4, 6, 8, 10];

export function BubblesPreviewClient() {
  const [count, setCount] = useState(8);
  const [long, setLong] = useState(false);
  const [role, setRole] = useState<LearningRole>('knownLanguage');
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const words = buildWords(count, long);
  const restart = () => {
    setScore(0);
    setLog([]);
    setRound((value) => value + 1);
  };

  return (
    <I18nProvider language="cs">
      <div className="flex min-h-[100dvh] flex-col bg-sand">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs text-ink">
          <span className="font-bold uppercase tracking-wider">bublinky</span>
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
              {value} slov
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
          {/* Level is only the payout: the real game gets it from the distractor
              band the anchor generator managed to fill, and the harness has no
              pool to draw near-twins from, so nothing but `+N` can change. */}
          <button
            type="button"
            onClick={() => setLevel((value) => (value === 3 ? 1 : ((value + 1) as 1 | 2 | 3)))}
            className="rounded-md border border-black/20 px-2 py-1 font-bold"
          >
            level {level} · +{level} b
          </button>
          <button type="button" onClick={restart} className="rounded-md border border-black/20 px-2 py-1 font-bold">
            restart
          </button>
          <span className="ml-auto font-bold" data-testid="preview-score">
            skóre {score}
          </span>
        </div>

        {/* Grid rather than block: it gives the game a definite height, so the
            field fills the viewport the way it does inside a study card. */}
        <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
          <BubbleChoiceGame
            key={`${round}:${count}:${long}:${role}`}
            words={words}
            role={role}
            level={level}
            onScore={(delta) => setScore((value) => value + delta)}
            onReviewOutcome={(wordId, outcome) =>
              setLog((entries) => [`${outcome}: ${wordId}`, ...entries].slice(0, 6))
            }
            onComplete={restart}
          />
        </div>

        {log.length > 0 && (
          <ul className="m-0 list-none border-t border-black/10 px-3 py-2 text-[0.7rem] text-ink-500">
            {log.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        )}
      </div>
    </I18nProvider>
  );
}
