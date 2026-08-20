'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { getWordTextBySide, knownSideForRole, learningSideForRole } from './types';
import { layoutBubbles, type BubblePlacement } from './bubbleLayout';

type Outcome = 'known' | 'unknown';

function orderFor(words: NormalizedWord[], seed: string): NormalizedWord[] {
  const output = [...words];
  let state = 0;
  for (const character of seed) state = ((state << 5) - state + character.charCodeAt(0)) | 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 13), 0x5bd1e995) | 0;
    const target = (state >>> 0) % (index + 1);
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

export function BubbleChoiceGame({
  words,
  role,
  level = 1,
  onScore,
  onReviewOutcome,
  onComplete,
}: {
  words: NormalizedWord[];
  role: LearningRole;
  level?: 1 | 2 | 3;
  onScore: (delta: number) => void;
  onReviewOutcome?: (wordId: string, outcome: Outcome) => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const [roundIndex, setRoundIndex] = useState(0);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [poppedId, setPoppedId] = useState<string | null>(null);
  const [mistaken, setMistaken] = useState(false);
  const [shake, setShake] = useState(false);
  const timers = useRef<number[]>([]);
  const reportedWordIds = useRef(new Set<string>());

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
  }, []);
  const later = (callback: () => void, delay: number) => {
    timers.current.push(window.setTimeout(callback, delay));
  };

  const roundOrder = useMemo(
    () => orderFor(words, `round:${words.map((word) => word.id).join('|')}`),
    [words],
  );
  const current = roundOrder[roundIndex];
  const choices = useMemo(
    () => orderFor(words, `choices:${current?.id ?? ''}:${roundIndex}`),
    [current?.id, roundIndex, words],
  );
  // Positions are seeded per round, so the field is stable while a round is on
  // screen but rearranges between rounds instead of drilling one muscle memory.
  const placements = useMemo(
    () => layoutBubbles(choices.map((word) => word.id), `${current?.id ?? ''}:${roundIndex}`),
    [choices, current?.id, roundIndex],
  );
  const complete = roundIndex >= roundOrder.length;

  const select = (word: NormalizedWord) => {
    if (!current || wrongId || poppedId || complete) return;
    if (word.id !== current.id) {
      setWrongId(word.id);
      setMistaken(true);
      setShake(true);
      // A round may allow several guesses, but it represents one review event.
      // Repeated wrong bubbles must not step the same SRS item back repeatedly.
      if (!reportedWordIds.current.has(current.id)) {
        reportedWordIds.current.add(current.id);
        onReviewOutcome?.(current.id, 'unknown');
      }
      later(() => setWrongId(null), 600);
      later(() => setShake(false), 500);
      return;
    }
    if (!mistaken && !reportedWordIds.current.has(current.id)) {
      reportedWordIds.current.add(current.id);
      onReviewOutcome?.(current.id, 'known');
    }
    onScore(level);
    setPoppedId(word.id);
    // Long enough for the pop to finish before the field is rebuilt.
    later(() => {
      setPoppedId(null);
      setWrongId(null);
      setMistaken(false);
      setRoundIndex((value) => value + 1);
    }, 420);
  };

  if (complete) {
    return (
      <article className="flex h-full min-h-80 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="m-0 text-2xl font-extrabold" style={{ color: 'var(--rail-new)' }}>
          ✓ {t('game.bubbleDone')}
        </p>
        <button type="button" onClick={onComplete} className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white">
          {t('card.continue')} →
        </button>
      </article>
    );
  }
  if (!current) return null;

  return (
    <article className={`relative flex h-full min-h-[26rem] w-full flex-col ${shake ? 'bubble-field-shake' : ''}`}>
      <div className="relative min-h-0 flex-1">
        {choices.map((word, index) => {
          const placement: BubblePlacement = placements[index];
          const wrong = wrongId === word.id;
          const popped = poppedId === word.id;
          const dim = Boolean(poppedId) && !popped;
          return (
            <button
              key={`${current.id}:${word.id}`}
              type="button"
              onClick={() => select(word)}
              {...noTranslateProps([
                'bubble absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-3',
                'text-center text-base font-bold leading-tight',
                wrong ? 'bubble-wrong' : '',
                popped ? 'bubble-pop' : '',
                dim ? 'bubble-dim' : '',
              ].filter(Boolean).join(' '))}
              style={{
                left: `${placement.x}%`,
                top: `${placement.y}%`,
                maxWidth: `${placement.maxWidth}%`,
                ['--bubble-float-duration' as string]: `${placement.duration}s`,
                ['--bubble-float-delay' as string]: `${placement.delay}s`,
                ['--bubble-float-shift' as string]: `${placement.shift}px`,
              }}
            >
              {getWordTextBySide(word, learningSideForRole(role))}
            </button>
          );
        })}
      </div>

      <div className="shrink-0 px-4 pb-2 text-center">
        <p className="m-0 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#4a4032]">
          {t('game.bubblePrompt')}
        </p>
        <p {...noTranslateProps('mb-0 mt-1 text-2xl font-extrabold text-[#1f1a12]')}>
          {getWordTextBySide(current, knownSideForRole(role))}
        </p>
      </div>
    </article>
  );
}
