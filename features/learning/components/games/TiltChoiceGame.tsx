'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { useI18n } from '@/components/I18nProvider';
import { useDeviceTilt } from '@/features/learning/hooks/useDeviceTilt';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import type { NormalizedWord } from '@/lib/words';
import {
  flipSide,
  getWordAudioSrcBySide,
  getWordAudioSrcsBySide,
  getWordTextBySide,
  knownSideForRole,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './types';

const DWELL_THRESHOLD = 0.6;
const DWELL_MS = 400;
const SMOOTHING = 0.18;

interface Props {
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  level?: 1 | 2;
  onResult?: (delta: number) => void;
  isActive?: boolean;
}

type Side = 'left' | 'right';

function deterministicOptionOrder(words: NormalizedWord[]): string[] {
  const ids = words.slice(0, 2).map((word) => word.id);
  let hash = 0;
  for (const character of ids.join('|')) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return (hash & 1) === 0 ? ids : [...ids].reverse();
}

export function TiltChoiceGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  soundEnabled = false,
  level = 1,
  onResult,
  isActive = true,
}: Props) {
  const { t } = useI18n();
  const { tilt, support, requestPermission } = useDeviceTilt();
  const [selected, setSelected] = useState<string | null>(null);
  const optionOrder = useMemo(() => deterministicOptionOrder(words), [words]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const leftOptionRef = useRef<HTMLButtonElement | null>(null);
  const rightOptionRef = useRef<HTMLButtonElement | null>(null);
  const leftFillRef = useRef<HTMLSpanElement | null>(null);
  const rightFillRef = useRef<HTMLSpanElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sensorTargetRef = useRef<number | null>(tilt);
  const mouseTargetRef = useRef(0);
  const mouseHoverRef = useRef(false);
  const displayedRef = useRef(0);
  const maxShiftRef = useRef(0);
  const answeredRef = useRef(false);

  const questionWord = words[0];
  const promptSide: WordSide = sourceLang ?? knownSideForRole(role);
  const answerSide: WordSide = flipSide(promptSide);
  const prompt = questionWord ? getWordTextBySide(questionWord, promptSide) : '';
  const correctAnswer = questionWord ? getWordTextBySide(questionWord, answerSide) : '';
  const promptAudioSrc = questionWord ? getWordAudioSrcBySide(questionWord, promptSide) : null;
  const effectivePromptMode: PromptMode =
    promptMode === 'audio' && promptAudioSrc ? 'audio' : 'text';

  const options = useMemo(
    () =>
      optionOrder
        .map((id) => words.find((word) => word.id === id))
        .filter((word): word is NormalizedWord => Boolean(word))
        .map((word) => ({
          id: word.id,
          label: getWordTextBySide(word, answerSide),
          answerAudioSrcs: getWordAudioSrcsBySide(word, answerSide),
          isCorrect: word.id === questionWord?.id,
        })),
    [answerSide, optionOrder, questionWord?.id, words],
  );

  const optionForSide = useCallback(
    (side: Side) => options[side === 'left' ? 0 : 1],
    [options],
  );

  const answerOnce = useCallback(
    (side: Side) => {
      if (answeredRef.current) return;
      const option = optionForSide(side);
      if (!option) return;
      answeredRef.current = true;
      setSelected(option.id);
      if (option.isCorrect && soundEnabled) {
        // Sensor/dwell completion may not retain browser user activation. Audio
        // is best-effort and never blocks recording the answer.
        void playUserInitiatedAudio(audioRef, option.answerAudioSrcs).catch(() => undefined);
      }
      onResult?.(option.isCorrect ? (level === 2 ? 2 : 1) : -1);
    },
    [level, onResult, optionForSide, soundEnabled],
  );

  useEffect(() => {
    sensorTargetRef.current = tilt;
  }, [tilt]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media?.matches === true);
    update();
    media?.addEventListener?.('change', update);
    return () => media?.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const promptElement = promptRef.current;
      if (!track || !promptElement) return;
      const optionWidth = Math.max(
        leftOptionRef.current?.offsetWidth ?? 0,
        rightOptionRef.current?.offsetWidth ?? 0,
      );
      maxShiftRef.current = Math.max(
        0,
        track.clientWidth / 2 - promptElement.offsetWidth / 2 - optionWidth - 20,
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (trackRef.current) observer?.observe(trackRef.current);
    if (promptRef.current) observer?.observe(promptRef.current);
    return () => observer?.disconnect();
  }, [effectivePromptMode, options]);

  useEffect(() => {
    let frame = 0;
    let dwellSide: Side | null = null;
    let dwellStartedAt = 0;
    const leftFill = leftFillRef.current;
    const rightFill = rightFillRef.current;

    const setFill = (side: Side | null, progress: number) => {
      if (leftFill) {
        leftFill.style.transform = `scaleX(${side === 'left' ? progress : 0})`;
      }
      if (rightFill) {
        rightFill.style.transform = `scaleX(${side === 'right' ? progress : 0})`;
      }
    };

    const tick = (now: number) => {
      if (answeredRef.current) return;

      const sensorTarget = sensorTargetRef.current;
      const target =
        isActive && !reducedMotion
          ? sensorTarget ?? (mouseHoverRef.current ? mouseTargetRef.current : 0)
          : 0;
      const displayed = displayedRef.current + (target - displayedRef.current) * SMOOTHING;
      displayedRef.current = Math.abs(displayed) < 0.001 ? 0 : displayed;
      if (promptRef.current) {
        promptRef.current.style.transform =
          `translate3d(${displayedRef.current * maxShiftRef.current}px, 0, 0)`;
      }

      const canDwell = isActive && !reducedMotion && maxShiftRef.current > 0;
      if (canDwell && Math.abs(displayedRef.current) >= DWELL_THRESHOLD) {
        const nextSide: Side = displayedRef.current < 0 ? 'left' : 'right';
        if (dwellSide !== nextSide) {
          dwellSide = nextSide;
          dwellStartedAt = now;
        }
        const progress = Math.min(1, (now - dwellStartedAt) / DWELL_MS);
        setFill(dwellSide, progress);
        if (progress >= 1) {
          answerOnce(dwellSide);
          return;
        }
      } else {
        dwellSide = null;
        dwellStartedAt = 0;
        setFill(null, 0);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      if (leftFill) leftFill.style.transform = 'scaleX(0)';
      if (rightFill) rightFill.style.transform = 'scaleX(0)';
    };
  }, [answerOnce, isActive, reducedMotion]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    mouseHoverRef.current = true;
    mouseTargetRef.current = Math.max(
      -1,
      Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)),
    );
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    mouseHoverRef.current = false;
    mouseTargetRef.current = 0;
  };

  const optionState = (id: string, isCorrect: boolean) => {
    if (!selected) return 'idle';
    if (id === selected && isCorrect) return 'correct';
    if (id === selected) return 'wrong';
    if (isCorrect) return 'reveal';
    return 'idle';
  };

  return (
    <article
      ref={cardRef}
      className="phrase-card game-card game-card--tilt touch-pan-y"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="game-badge">🧭 {t('game.tiltChoice')}</div>
        {support === 'needs-permission' && isActive && !reducedMotion && (
          <button
            type="button"
            className="rounded-full border-2 border-[var(--game-ink)] px-3 py-1 text-xs font-bold text-[var(--game-ink)]"
            onClick={(event) => {
              event.stopPropagation();
              void requestPermission();
            }}
          >
            {t('game.tiltEnable')}
          </button>
        )}
      </div>

      <div ref={trackRef} className="relative flex min-h-[300px] flex-1 items-center justify-center">
        {options.map((option, index) => {
          const side: Side = index === 0 ? 'left' : 'right';
          return (
            <button
              key={option.id}
              ref={side === 'left' ? leftOptionRef : rightOptionRef}
              type="button"
              className={`game-option game-option--${optionState(option.id, option.isCorrect)} absolute top-1/2 z-[2] max-w-[34%] -translate-y-1/2 overflow-hidden ${
                side === 'left' ? 'left-0' : 'right-0'
              }`}
              onClick={() => answerOnce(side)}
              disabled={Boolean(selected)}
            >
              <span
                ref={side === 'left' ? leftFillRef : rightFillRef}
                className="tilt-choice-fill"
                aria-hidden="true"
              />
              <span className="relative z-[1]">{option.label}</span>
            </button>
          );
        })}

        <div
          ref={promptRef}
          className="game-prompt relative z-[1] max-w-[42%] will-change-transform"
        >
          {effectivePromptMode === 'audio' ? (
            <button
              type="button"
              className="game-audio-btn"
              onClick={() => void playUserInitiatedAudio(audioRef, promptAudioSrc)}
              aria-label={t('game.replayPromptAudio')}
            >
              🔊
            </button>
          ) : (
            prompt
          )}
        </div>
      </div>

      {selected ? (
        <div className="game-feedback">
          <span
            className={
              options.find((option) => option.id === selected)?.isCorrect
                ? 'game-feedback--exact'
                : 'game-feedback--wrong'
            }
          >
            {options.find((option) => option.id === selected)?.isCorrect
              ? `✓ ${t('game.correct')}`
              : `✗  ${correctAnswer}`}
          </span>
        </div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
