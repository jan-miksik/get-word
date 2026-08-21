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
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { SuccessMarkSlot } from './SuccessMark';
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

const SMOOTHING = 0.18;
const MAX_TILT_DEG = 16;
// The selection is position-based and reversible: the option underline fills in
// sync with the tilt between FILL_START and COMMIT_AT, and backing off rewinds
// it. Only reaching COMMIT_AT locks the answer in.
const FILL_START = 0.15;
const COMMIT_AT = 0.78;
// Past the plank end the word overhangs and tips over before falling off.
const OVERHANG_PX = 44;
const TIP_DEG = 24;
// Free-fall physics for the committed word: it drops off the plank end along a
// parabola aimed below the chosen option, tumbles in the air, bounces with
// damping, and comes to rest on the stage floor.
const GRAVITY_PX_S2 = 2600;
const TUMBLE_DEG_S = 170;
const BOUNCE_MIN_VY = 170;
const BOUNCE_DAMPING = 0.36;
const FALL_MAX_SIM_S = 2.5;

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
  const plankRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const leftOptionRef = useRef<HTMLButtonElement | null>(null);
  const rightOptionRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fallFrameRef = useRef<number | null>(null);
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

  const setFillTransforms = useCallback((side: Side | null, progress: number) => {
    if (leftFillRef.current) {
      leftFillRef.current.style.transform = `scaleX(${side === 'left' ? progress : 0})`;
    }
    if (rightFillRef.current) {
      rightFillRef.current.style.transform = `scaleX(${side === 'right' ? progress : 0})`;
    }
  }, []);

  const finishAnswer = useCallback(
    (side: Side) => {
      const option = optionForSide(side);
      if (!option) return;
      setFillTransforms(null, 0);
      setSelected(option.id);
      if (option.isCorrect && soundEnabled) {
        // Sensor-driven completion may not retain browser user activation.
        // Audio is best-effort and never blocks recording the answer.
        void playUserInitiatedAudio(audioRef, option.answerAudioSrcs).catch(() => undefined);
      }
      onResult?.(option.isCorrect ? (level === 2 ? 2 : 1) : -1);
    },
    [level, onResult, optionForSide, setFillTransforms, soundEnabled],
  );

  const startFall = useCallback(
    (side: Side): boolean => {
      const promptElement = promptRef.current;
      const optionElement = side === 'left' ? leftOptionRef.current : rightOptionRef.current;
      const stageElement = stageRef.current;
      if (!promptElement || !optionElement || !stageElement) return false;
      const promptRect = promptElement.getBoundingClientRect();
      const optionRect = optionElement.getBoundingClientRect();
      const stageRect = stageElement.getBoundingClientRect();
      if (promptRect.width === 0 || optionRect.width === 0 || stageRect.height === 0) {
        return false;
      }

      // The plank freezes at the commit angle, so the page→local conversion is
      // a constant rotation for the whole fall.
      const theta = (displayedRef.current * MAX_TILT_DEG * Math.PI) / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const travel = displayedRef.current * (maxShiftRef.current + OVERHANG_PX);
      const overhang = Math.max(0, Math.abs(travel) - maxShiftRef.current);
      const tip = (overhang / OVERHANG_PX) * TIP_DEG * Math.sign(travel);

      const startX = promptRect.left + promptRect.width / 2;
      const startY = promptRect.top + promptRect.height / 2;
      const groundY = stageRect.bottom - promptRect.height / 2 - 2;
      const targetX = optionRect.left + optionRect.width / 2;
      const drop = Math.max(40, groundY - startY);

      // Horizontal speed is chosen so the parabola's first impact lands right
      // below the chosen option; gravity does the rest.
      const timeToImpact = Math.sqrt((2 * drop) / GRAVITY_PX_S2);
      let vx = (targetX - startX) / timeToImpact;
      let vy = 0;
      let omega = (side === 'left' ? -1 : 1) * TUMBLE_DEG_S;
      let x = startX;
      let y = startY;
      let rotation = 0;
      let simTime = 0;
      let last: number | null = null;
      let startedAt: number | null = null;

      const step = (now: number) => {
        // Throttled tabs deliver animation frames sparsely; past a wall-clock
        // budget the word snaps to rest instead of simulating forever.
        startedAt ??= now;
        const outOfTime = now - startedAt > 3000;
        const dt = Math.min(0.04, last === null ? 0.016 : Math.max(0.001, (now - last) / 1000));
        last = now;
        simTime += dt;
        vy += GRAVITY_PX_S2 * dt;
        x += vx * dt;
        y += vy * dt;
        rotation += omega * dt;

        let resting = false;
        if (y >= groundY) {
          y = groundY;
          if (vy > BOUNCE_MIN_VY && simTime < FALL_MAX_SIM_S) {
            vy = -vy * BOUNCE_DAMPING;
            vx *= 0.6;
            omega *= 0.45;
          } else {
            resting = true;
          }
        }
        if (simTime >= FALL_MAX_SIM_S || outOfTime) {
          y = groundY;
          resting = true;
        }

        const dxPage = x - startX;
        const dyPage = y - startY;
        const localX = travel + dxPage * cos + dyPage * sin;
        const localY = -dxPage * sin + dyPage * cos;
        promptElement.style.transform =
          `translate3d(${localX}px, ${localY}px, 0) rotate(${tip + rotation}deg)`;

        if (resting) {
          fallFrameRef.current = null;
          finishAnswer(side);
          return;
        }
        fallFrameRef.current = window.requestAnimationFrame(step);
      };

      setFillTransforms(side, 1);
      fallFrameRef.current = window.requestAnimationFrame(step);
      return true;
    },
    [finishAnswer, setFillTransforms],
  );

  const commitAnswer = useCallback(
    (side: Side) => {
      if (answeredRef.current) return;
      if (!optionForSide(side)) return;
      answeredRef.current = true;
      if (reducedMotion || !startFall(side)) {
        finishAnswer(side);
      }
    },
    [finishAnswer, optionForSide, reducedMotion, startFall],
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
      const plank = plankRef.current;
      const promptElement = promptRef.current;
      if (!plank || !promptElement) return;
      maxShiftRef.current = Math.max(
        0,
        plank.clientWidth / 2 - promptElement.offsetWidth / 2 - 8,
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (plankRef.current) observer?.observe(plankRef.current);
    if (promptRef.current) observer?.observe(promptRef.current);
    return () => observer?.disconnect();
  }, [effectivePromptMode, options]);

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      if (answeredRef.current) return;

      const sensorTarget = sensorTargetRef.current;
      const target =
        isActive && !reducedMotion
          ? sensorTarget ?? (mouseHoverRef.current ? mouseTargetRef.current : 0)
          : 0;
      const displayed = displayedRef.current + (target - displayedRef.current) * SMOOTHING;
      displayedRef.current = Math.abs(displayed) < 0.001 ? 0 : displayed;
      const value = displayedRef.current;

      // The plank rotates like a seesaw while the word slides along it toward
      // the lower end; past the end it overhangs and tips over the edge.
      if (plankRef.current) {
        plankRef.current.style.transform = `rotate(${value * MAX_TILT_DEG}deg)`;
      }
      const travel = value * (maxShiftRef.current + OVERHANG_PX);
      const overhang = Math.max(0, Math.abs(travel) - maxShiftRef.current);
      const tip = (overhang / OVERHANG_PX) * TIP_DEG * Math.sign(travel);
      if (promptRef.current) {
        promptRef.current.style.transform = `translate3d(${travel}px, 0, 0) rotate(${tip}deg)`;
      }

      const side: Side = value < 0 ? 'left' : 'right';
      const progress = Math.min(
        1,
        Math.max(0, (Math.abs(value) - FILL_START) / (COMMIT_AT - FILL_START)),
      );
      setFillTransforms(progress > 0 ? side : null, progress);

      if (isActive && !reducedMotion && maxShiftRef.current > 0 && Math.abs(value) >= COMMIT_AT) {
        commitAnswer(side);
        return;
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [commitAnswer, isActive, reducedMotion, setFillTransforms]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (fallFrameRef.current !== null) window.cancelAnimationFrame(fallFrameRef.current);
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
      <SuccessMarkSlot
        show={Boolean(selected && options.find((option) => option.id === selected)?.isCorrect)}
        label={t('game.correct')}
        rollKey={questionWord?.id}
      />
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
        {support === 'insecure' && isActive && (
          <span className="text-xs font-semibold text-[var(--game-ink-soft)]">
            {t('game.tiltNeedsHttps')}
          </span>
        )}
      </div>

      <div ref={stageRef} className="relative min-h-[320px] flex-1">
        <div
          ref={plankRef}
          className="absolute inset-x-0 top-[34%] mx-auto w-[58%] origin-bottom will-change-transform"
        >
          <div className="flex justify-center">
            <div
              ref={promptRef}
              {...noTranslateProps(
                'game-prompt relative z-[1] max-w-[70%] pb-1.5 will-change-transform',
              )}
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
          <div className="tilt-plank" aria-hidden="true" />
        </div>

        {options.map((option, index) => {
          const side: Side = index === 0 ? 'left' : 'right';
          return (
            <button
              key={option.id}
              ref={side === 'left' ? leftOptionRef : rightOptionRef}
              type="button"
              className={`tilt-option tilt-option--${optionState(option.id, option.isCorrect)} absolute bottom-14 z-[2] max-w-[42%] ${
                side === 'left' ? 'left-1' : 'right-1'
              }`}
              onClick={() => commitAnswer(side)}
              disabled={Boolean(selected)}
            >
              <span
                ref={side === 'left' ? leftFillRef : rightFillRef}
                className="tilt-choice-fill"
                aria-hidden="true"
              />
              <span {...noTranslateProps('relative z-[1]')}>{option.label}</span>
            </button>
          );
        })}
      </div>

      {selected && !options.find((option) => option.id === selected)?.isCorrect ? (
        <div className="game-feedback">
          {/* The two branches are separate elements so the wrong-answer one can
              carry the study-text opt-out on a single text node, rather than
              splitting the line around an inner span. */}
          <span {...noTranslateProps('game-feedback--wrong')}>{`✗  ${correctAnswer}`}</span>
        </div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
