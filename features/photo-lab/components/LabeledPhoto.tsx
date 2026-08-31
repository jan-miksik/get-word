'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { matchAnswer } from '@/features/learning/minigames/answer-match';
import type { PhotoLabLabel } from '@/features/photo-lab/types';
import { getWarmedClipUrl, prefetchClips } from '@/lib/audio-clip-playback';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import { resolveChipCollisions } from './resolveChipCollisions';
import { TypeAnswerBar, type TypeFeedback } from './TypeAnswerBar';
import { usePhotoZoom } from './usePhotoZoom';

const MODE_STORAGE_KEY = 'get-word-photo-lab-mode';
const CORRECT_CLOSE_MS = 700;

export type PhotoLabMode = 'reveal' | 'type';

function readStoredMode(): PhotoLabMode {
  if (typeof window === 'undefined') return 'reveal';
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === 'type' ? 'type' : 'reveal';
  } catch {
    return 'reveal';
  }
}

function storeMode(mode: PhotoLabMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Preference persistence is best-effort.
  }
}

type ChipState = 'hidden' | 'active' | 'revealed' | 'solved';

// The chip is a div with sibling buttons (main body + speaker) — a button
// inside a button is invalid HTML. data-photo-label excludes chips from the
// viewport's double-tap zoom.
function LabelChip({
  label,
  state,
  isFront,
  counterScale,
  audioHash,
  playAudioLabel,
  onPress,
  onPlayAudio,
}: {
  label: PhotoLabLabel;
  state: ChipState;
  isFront: boolean;
  counterScale: number;
  audioHash: string | undefined;
  playAudioLabel: string;
  onPress: () => void;
  onPlayAudio: (hash: string) => void;
}) {
  const showTarget = state === 'revealed' || state === 'solved';
  // Literal palette colors (not var + opacity modifier): Tailwind compiles
  // var-based opacity to color-mix(), which older iOS Safari drops entirely.
  const surface =
    state === 'solved'
      ? 'bg-green-alt/90'
      : state === 'revealed'
        ? 'bg-sea/90'
        : 'bg-black/60';
  return (
    <div
      data-photo-label
      className={`absolute flex max-w-48 items-center rounded-full border border-white/25 shadow backdrop-blur-sm transition-colors sm:max-w-64 ${surface} ${
        state === 'active' ? 'ring-2 ring-[var(--ob-accent)]' : ''
      } ${showTarget ? 'animate-[photo-lab-chip-pop_240ms_ease-out] motion-reduce:animate-none' : ''}`}
      style={{
        left: `${label.x * 100}%`,
        top: `${label.y * 100}%`,
        // Anchor slides with the position (center at 0.5, chip edge at 0/1),
        // so chips near the photo edge stay fully inside instead of being
        // clipped by the viewport's overflow-hidden.
        transform: `translate(${label.x * -100}%, ${label.y * -100}%) scale(${counterScale})`,
        zIndex: isFront ? 20 : 1,
      }}
    >
      <button
        type="button"
        onClick={onPress}
        aria-pressed={showTarget}
        {...noTranslateProps(
          `min-w-0 truncate py-1 pl-2.5 text-xs text-white sm:py-1.5 sm:pl-3 sm:text-base ${
            showTarget && audioHash ? 'pr-1 sm:pr-1.5' : 'pr-2.5 sm:pr-3'
          }`,
        )}
      >
        {showTarget ? label.target : label.known}
        {state === 'hidden' && (
          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white/70 align-middle" />
        )}
      </button>
      {showTarget && audioHash && (
        <button
          type="button"
          aria-label={playAudioLabel}
          onClick={(e) => {
            e.stopPropagation();
            onPlayAudio(audioHash);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/90 hover:text-white sm:h-7 sm:w-7"
        >
          <SpeakerIcon size={14} className="sm:h-4 sm:w-4" />
        </button>
      )}
    </div>
  );
}

export function LabeledPhoto({
  imageUrl,
  labels,
  audioHashes,
  active = true,
}: {
  imageUrl: string;
  labels: PhotoLabLabel[];
  /** label.id → audio content hash, filled in asynchronously after analysis. */
  audioHashes?: Record<string, string>;
  active?: boolean;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<PhotoLabMode>(readStoredMode);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [solvedIds, setSolvedIds] = useState<Set<string>>(() => new Set());
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [frontLabelId, setFrontLabelId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [feedback, setFeedback] = useState<TypeFeedback>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { transform, animating, handlers } = usePhotoZoom(viewportRef, active);
  const placedLabels = useMemo(() => resolveChipCollisions(labels), [labels]);
  const activeLabel = placedLabels.find((label) => label.id === activeLabelId) ?? null;

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active || !audioHashes) return;
    void prefetchClips(Object.values(audioHashes));
  }, [active, audioHashes]);

  const closeAnswerBar = () => {
    clearCloseTimer();
    setActiveLabelId(null);
    setTyped('');
    setFeedback(null);
  };

  const switchMode = (next: PhotoLabMode) => {
    if (next === mode) return;
    storeMode(next);
    closeAnswerBar();
    // Entering type mode flips every revealed chip back to the known language
    // so it becomes practicable again; solved answers stay earned.
    if (next === 'type') setRevealedIds(new Set());
    setMode(next);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const pressChip = (label: PhotoLabLabel) => {
    setFrontLabelId(label.id);
    if (mode === 'reveal') {
      toggleReveal(label.id);
      return;
    }
    if (solvedIds.has(label.id) || revealedIds.has(label.id)) return;
    if (activeLabelId === label.id) {
      inputRef.current?.focus();
      return;
    }
    clearCloseTimer();
    // flushSync so the answer bar is in the DOM before we focus its input —
    // iOS only opens the keyboard for focus within the original user gesture.
    flushSync(() => {
      setActiveLabelId(label.id);
      setTyped('');
      setFeedback(null);
    });
    inputRef.current?.focus();
  };

  const submitAnswer = () => {
    if (!activeLabel) return;
    const verdict = matchAnswer(typed.trim(), activeLabel.target);
    if (verdict === 'wrong') {
      setFeedback('wrong');
      return;
    }
    setFeedback(verdict === 'exact' ? 'correct' : 'close');
    const solvedId = activeLabel.id;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(
      () => {
        setSolvedIds((current) => new Set(current).add(solvedId));
        closeAnswerBar();
      },
      CORRECT_CLOSE_MS,
    );
  };

  const showAnswer = () => {
    if (!activeLabel) return;
    setRevealedIds((current) => new Set(current).add(activeLabel.id));
    closeAnswerBar();
  };

  const playAudio = (hash: string) => {
    // Must start synchronously from the tap (mobile autoplay policy).
    const warmedUrl = getWarmedClipUrl(hash);
    void playUserInitiatedAudio(
      audioRef,
      warmedUrl ? [warmedUrl, `/api/audio/${hash}`] : `/api/audio/${hash}`,
    );
  };

  const chipState = (label: PhotoLabLabel): ChipState => {
    if (mode === 'type') {
      if (solvedIds.has(label.id)) return 'solved';
      if (revealedIds.has(label.id)) return 'revealed';
      if (activeLabelId === label.id) return 'active';
      return 'hidden';
    }
    return revealedIds.has(label.id) ? 'revealed' : 'hidden';
  };

  return (
    <section className="flex w-full flex-col gap-3 animate-[photo-lab-rise_0.45s_ease-out_both] motion-reduce:animate-none">
      <div className="mx-auto flex w-full max-w-[800px] flex-wrap items-center justify-between gap-2 px-1 md:px-4">
        <div
          role="group"
          aria-label={t('photoLab.title')}
          className="flex gap-1 rounded-2xl border-2 border-[color:var(--ob-ink)]/60 p-1"
        >
          {(['reveal', 'type'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => switchMode(option)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                mode === option
                  ? 'bg-[var(--ob-ink)] text-[var(--ob-surface)]'
                  : 'text-[color:var(--ob-ink-soft)] hover:bg-ink/8'
              }`}
            >
              {option === 'reveal' ? t('photoLab.modeReveal') : t('photoLab.modeType')}
            </button>
          ))}
        </div>

        {labels.length > 0 && (
          <p className="m-0 text-xs text-[color:var(--ob-ink-soft)] sm:text-base">
            {mode === 'type' ? t('photoLab.typeHint') : t('photoLab.tapToReveal')}
          </p>
        )}
      </div>

      <div className="relative -mx-3 grid items-end justify-items-center sm:mx-0">
        <div
          ref={viewportRef}
          {...handlers}
          className={`relative inline-grid max-w-full select-none overflow-hidden bg-black/5 shadow-lg [grid-area:1/1] sm:rounded-2xl sm:border-2 sm:border-[color:var(--ob-ink)] sm:shadow-xl sm:shadow-ink/10 ${
            transform.scale > 1 ? 'touch-none' : 'touch-pan-y'
          }`}
        >
          <div
            className="relative inline-grid max-w-full"
            style={{
              transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
              transition: animating ? 'transform 200ms ease-out' : 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URL, next/image cannot optimize it */}
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="block h-auto max-h-[calc(100dvh-10rem)] w-auto max-w-full"
            />
            {placedLabels.map((label) => (
              <LabelChip
                key={label.id}
                label={label}
                state={chipState(label)}
                isFront={frontLabelId === label.id}
                counterScale={1 / transform.scale}
                audioHash={audioHashes?.[label.id]}
                playAudioLabel={t('photoLab.playAudio')}
                onPress={() => pressChip(label)}
                onPlayAudio={playAudio}
              />
            ))}
          </div>
        </div>
        {mode === 'type' && activeLabel && (
          // Mobile: in flow below the photo, sticky-pinned to the viewport
          // bottom until its resting place scrolls into view — so it floats
          // over at most the photo's bottom edge instead of covering it.
          // sm+: sticky overlay pinned to the photo's bottom edge.
          <div className="pointer-events-none sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-2xl pt-2 sm:bottom-4 sm:self-end sm:px-4 sm:pb-4 sm:pt-0 sm:[grid-area:1/1]">
            <div className="pointer-events-auto">
              <TypeAnswerBar
                label={activeLabel}
                value={typed}
                feedback={feedback}
                inputRef={inputRef}
                onChange={(value) => {
                  setTyped(value);
                  if (feedback === 'wrong') setFeedback(null);
                }}
                onSubmit={submitAnswer}
                onShowAnswer={showAnswer}
              />
            </div>
          </div>
        )}
      </div>

      {labels.length === 0 && (
        <p className="m-0 text-sm text-[color:var(--ob-ink-soft)]">{t('photoLab.noLabels')}</p>
      )}
    </section>
  );
}
