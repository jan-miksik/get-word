'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { matchAnswer } from '@/features/learning/minigames/answer-match';
import type { PhotoLabLabel } from '@/features/photo-lab/types';
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
  counterScale,
  audioHash,
  playAudioLabel,
  onPress,
  onPlayAudio,
}: {
  label: PhotoLabLabel;
  state: ChipState;
  counterScale: number;
  audioHash: string | undefined;
  playAudioLabel: string;
  onPress: () => void;
  onPlayAudio: (hash: string) => void;
}) {
  const showTarget = state === 'revealed' || state === 'solved';
  const surface =
    state === 'solved'
      ? 'bg-[var(--ob-correct)]/90'
      : state === 'revealed'
        ? 'bg-[var(--ob-accent)]/90'
        : 'bg-black/60';
  return (
    <div
      data-photo-label
      className={`absolute flex max-w-48 items-center rounded-full shadow backdrop-blur-sm transition-colors ${surface} ${
        state === 'active' ? 'ring-2 ring-[var(--ob-accent)]' : ''
      }`}
      style={{
        left: `${label.x * 100}%`,
        top: `${label.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${counterScale})`,
      }}
    >
      <button
        type="button"
        onClick={onPress}
        aria-pressed={showTarget}
        className={`min-w-0 truncate py-1 pl-2.5 text-xs text-white ${
          showTarget && audioHash ? 'pr-1' : 'pr-2.5'
        }`}
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
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/90 hover:text-white"
        >
          <SpeakerIcon size={14} />
        </button>
      )}
    </div>
  );
}

export function LabeledPhoto({
  imageUrl,
  labels,
  audioHashes,
}: {
  imageUrl: string;
  labels: PhotoLabLabel[];
  /** label.id → audio content hash, filled in asynchronously after analysis. */
  audioHashes?: Record<string, string>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<PhotoLabMode>(readStoredMode);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [solvedIds, setSolvedIds] = useState<Set<string>>(() => new Set());
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [feedback, setFeedback] = useState<TypeFeedback>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { transform, animating, handlers } = usePhotoZoom(viewportRef);
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
    void playUserInitiatedAudio(audioRef, `/api/audio/${hash}`);
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
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t('photoLab.title')}
        className="flex gap-1 self-center rounded-xl border-2 border-[color:var(--ob-ink)] p-1"
      >
        {(['reveal', 'type'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => switchMode(option)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === option
                ? 'bg-[var(--ob-accent)] text-white'
                : 'text-[color:var(--ob-ink-soft)] hover:bg-[var(--ob-surface-hover)]'
            }`}
          >
            {option === 'reveal' ? t('photoLab.modeReveal') : t('photoLab.modeType')}
          </button>
        ))}
      </div>

      <div
        ref={viewportRef}
        {...handlers}
        className={`relative -mx-4 select-none overflow-hidden sm:mx-0 sm:rounded-xl ${
          transform.scale > 1 ? 'touch-none' : 'touch-pan-y'
        }`}
      >
        <div
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
            transition: animating ? 'transform 200ms ease-out' : 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URL, next/image cannot optimize it */}
          <img src={imageUrl} alt="" draggable={false} className="block w-full" />
          {placedLabels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              state={chipState(label)}
              counterScale={1 / transform.scale}
              audioHash={audioHashes?.[label.id]}
              playAudioLabel={t('photoLab.playAudio')}
              onPress={() => pressChip(label)}
              onPlayAudio={playAudio}
            />
          ))}
        </div>
        {mode === 'type' && activeLabel && (
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
        )}
      </div>

      {labels.length === 0 ? (
        <p className="m-0 text-sm text-[color:var(--ob-ink-soft)]">{t('photoLab.noLabels')}</p>
      ) : (
        <p className="m-0 text-xs text-[color:var(--ob-ink-soft)]/80">
          {mode === 'type' ? t('photoLab.typeHint') : t('photoLab.tapToReveal')}
        </p>
      )}
    </div>
  );
}
