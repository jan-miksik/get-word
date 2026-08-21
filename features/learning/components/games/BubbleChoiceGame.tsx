'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useI18n } from '@/components/I18nProvider';
import { SuccessMark } from './SuccessMark';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { getWordTextBySide, knownSideForRole, learningSideForRole } from './types';
import {
  createBubbleBodies,
  pushBubblesFrom,
  rescaleBubbleField,
  seededRandom,
  stepBubbleField,
  type BubbleBody,
  type BubbleFieldSize,
  type BubbleSize,
} from './bubblePhysics';

type Outcome = 'known' | 'unknown';

/** Long enough for the burst and its shards to finish before the node leaves. */
const BURST_MS = 560;
const WRONG_MS = 620;
const SHAKE_MS = 420;
/** Shockwave strengths, px/s added to the neighbours. */
const POP_SHOCKWAVE = 170;
const WRONG_SHOCKWAVE = 95;
const SHARD_COUNT = 7;
/** Breathing room between the simulated field and the card's real edges, px. */
const FIELD_INSET = 6;

/** Per-bubble breathing clock, so the field never pulses in unison. */
function breatheStyle(id: string): CSSProperties {
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const fraction = ((hash >>> 0) % 1000) / 1000;
  return {
    ['--bubble-breathe-duration' as string]: `${(3.2 + fraction * 2.4).toFixed(2)}s`,
    animationDelay: `-${(fraction * 4).toFixed(2)}s`,
  } as CSSProperties;
}

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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
  // Solved words leave the field for good: a correct answer must not reshuffle
  // the words the learner has already read, it must remove one of them.
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const [burstingId, setBurstingId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
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
  const solvedSet = useMemo(() => new Set(solvedIds), [solvedIds]);
  const roundIndex = solvedIds.length;
  const current = roundOrder[roundIndex];
  // While the last bubble bursts there is no next word; the prompt holds the
  // one just answered rather than blanking for the length of the animation.
  const promptWord = current ?? roundOrder[roundOrder.length - 1];
  const remaining = roundOrder.length - roundIndex;
  // The field keeps its original order so React reuses the same DOM nodes — a
  // bubble must never be handed to a different word mid-flight.
  const fieldWords = useMemo(
    () => words.filter((word) => !solvedSet.has(word.id) || word.id === burstingId),
    [burstingId, solvedSet, words],
  );
  const complete = roundIndex >= roundOrder.length && !burstingId;

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const holders = useRef(new Map<string, HTMLDivElement>());
  const bodies = useRef<BubbleBody[]>([]);
  const fieldSize = useRef<BubbleFieldSize>({ width: 0, height: 0 });
  const random = useRef<(() => number) | null>(null);
  if (random.current == null) random.current = seededRandom('drift');
  const [placed, setPlaced] = useState(false);
  const [fieldTick, setFieldTick] = useState(0);
  const reducedMotion = useRef(false);

  // One stable callback for every bubble: the node carries its own id, so no
  // per-word closure has to be built (and cached in a ref) during render.
  const holderRef = useCallback((node: HTMLDivElement) => {
    const id = node.dataset.bubbleId;
    if (!id) return;
    holders.current.set(id, node);
    return () => {
      holders.current.delete(id);
    };
  }, []);

  const writeTransforms = useCallback(() => {
    for (const body of bodies.current) {
      const holder = holders.current.get(body.id);
      if (holder) {
        const x = body.x - body.hw + FIELD_INSET;
        const y = body.y - body.hh + FIELD_INSET;
        holder.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    }
  }, []);

  // A single string so the layout effect can depend on *which* bubbles are on
  // the field without re-running for every new array identity.
  const fieldIdsKey = fieldWords.map((word) => word.id).join('\u0000');

  // Positions live in pixels measured from the rendered bubbles, which is what
  // keeps a long phrase on a narrow phone inside the field instead of hanging
  // off its edge.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const width = field.clientWidth - FIELD_INSET * 2;
    const height = field.clientHeight - FIELD_INSET * 2;
    if (width <= 0 || height <= 0) return;

    const ids = fieldIdsKey ? fieldIdsKey.split('\u0000') : [];
    const measured: BubbleSize[] = ids.map((id) => {
      const holder = holders.current.get(id);
      return {
        id,
        width: holder?.offsetWidth || 96,
        height: holder?.offsetHeight || 48,
      };
    });
    const previous = fieldSize.current;
    fieldSize.current = { width, height };

    const known = new Set(ids);
    bodies.current = bodies.current.filter((body) => known.has(body.id));
    if (bodies.current.length > 0) {
      // Also picks up size changes that are not a resize, such as a web font
      // swapping in after the first paint and widening every bubble.
      rescaleBubbleField(bodies.current, previous, fieldSize.current, measured);
    }
    const settled = new Set(bodies.current.map((body) => body.id));
    const missing = measured.filter((size) => !settled.has(size.id));
    if (missing.length > 0) {
      bodies.current = [
        ...bodies.current,
        ...createBubbleBodies(missing, fieldSize.current, fieldIdsKey),
      ];
    }

    writeTransforms();
    setPlaced(true);
  }, [fieldIdsKey, fieldTick, writeTransforms]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setFieldTick((tick) => tick + 1));
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    reducedMotion.current = prefersReducedMotion();
  }, []);

  useEffect(() => {
    if (!placed || reducedMotion.current || typeof requestAnimationFrame === 'undefined') return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const seconds = (now - last) / 1000;
      last = now;
      stepBubbleField(bodies.current, fieldSize.current, seconds, random.current!);
      writeTransforms();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [placed, writeTransforms]);

  const select = (word: NormalizedWord) => {
    if (!current || complete || word.id === burstingId) return;
    const body = bodies.current.find(candidate => candidate.id === word.id);

    if (word.id !== current.id) {
      setWrongId(word.id);
      setMistaken(true);
      setShake(true);
      if (body) {
        // The field flinches away from the miss, so a wrong tap is felt in the
        // whole scatter and not only in the bubble that was hit.
        pushBubblesFrom(
          bodies.current.filter((candidate) => candidate.id !== word.id),
          { x: body.x, y: body.y },
          WRONG_SHOCKWAVE,
        );
        body.vx *= -1;
        body.vy *= -1;
      }
      // A round may allow several guesses, but it represents one review event.
      // Repeated wrong bubbles must not step the same SRS item back repeatedly.
      if (!reportedWordIds.current.has(current.id)) {
        reportedWordIds.current.add(current.id);
        onReviewOutcome?.(current.id, 'unknown');
      }
      later(() => setWrongId((value) => (value === word.id ? null : value)), WRONG_MS);
      later(() => setShake(false), SHAKE_MS);
      return;
    }

    if (!mistaken && !reportedWordIds.current.has(current.id)) {
      reportedWordIds.current.add(current.id);
      onReviewOutcome?.(current.id, 'known');
    }
    onScore(level);
    if (body) {
      body.frozen = true;
      pushBubblesFrom(bodies.current, { x: body.x, y: body.y }, POP_SHOCKWAVE);
    }
    // The prompt and the counter advance now; the burst plays out on its own so
    // the learner can keep going without waiting for the animation.
    setSolvedIds((value) => [...value, word.id]);
    setBurstingId(word.id);
    setWrongId(null);
    setMistaken(false);
    later(() => setBurstingId((value) => (value === word.id ? null : value)), BURST_MS);
  };

  if (complete) {
    return (
      <article className="flex h-full min-h-80 flex-col items-center justify-center gap-4 p-6 text-center">
        <SuccessMark label="" size="large" />
        <p className="m-0 text-2xl font-extrabold" style={{ color: 'var(--rail-new)' }}>
          {t('game.bubbleDone')}
        </p>
        <button type="button" onClick={onComplete} className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white">
          {t('card.continue')} →
        </button>
      </article>
    );
  }

  return (
    <article className={`relative flex h-full min-h-[26rem] w-full flex-col ${shake ? 'bubble-field-shake' : ''}`}>
      <div
        ref={fieldRef}
        className={`bubble-field relative min-h-0 flex-1 overflow-hidden ${placed ? 'is-placed' : ''}`}
      >
        {fieldWords.map((word) => {
          const wrong = wrongId === word.id;
          const bursting = burstingId === word.id;
          return (
            <div key={word.id} ref={holderRef} data-bubble-id={word.id} className="bubble-holder">
              <button
                type="button"
                onClick={() => select(word)}
                disabled={bursting}
                style={bursting || wrong ? undefined : breatheStyle(word.id)}
                {...noTranslateProps([
                  'bubble rounded-full px-4 py-3 text-center text-base font-bold leading-tight',
                  wrong ? 'bubble-wrong' : '',
                  bursting ? 'bubble-pop' : '',
                ].filter(Boolean).join(' '))}
              >
                {getWordTextBySide(word, learningSideForRole(role))}
              </button>
              {/* The burst is a sibling of the bubble, not a child: the bubble
                  fades to nothing, and opacity on a parent would take the ring,
                  the shards and the score down with it. */}
              {bursting && (
                <span className="bubble-burst" aria-hidden="true">
                  <span className="bubble-burst-ring" />
                  {Array.from({ length: SHARD_COUNT }, (_, index) => (
                    <span
                      key={index}
                      className="bubble-shard"
                      style={{ ['--shard-angle' as string]: `${(360 / SHARD_COUNT) * index}deg` }}
                    />
                  ))}
                  <span className="bubble-score">+{level}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-4 pb-2 text-center">
        <div className="bubble-progress" role="img" aria-label={`${remaining}/${roundOrder.length}`}>
          {roundOrder.map((word, index) => (
            <span key={word.id} className={`bubble-pip ${index < roundIndex ? 'is-done' : ''}`} />
          ))}
          <span className="bubble-progress-count">{remaining}</span>
        </div>
        <p className="m-0 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#4a4032]">
          {t('game.bubblePrompt')}
        </p>
        <p {...noTranslateProps('mb-0 mt-1 text-2xl font-extrabold text-[#1f1a12]')}>
          {promptWord ? getWordTextBySide(promptWord, knownSideForRole(role)) : ''}
        </p>
      </div>
    </article>
  );
}
