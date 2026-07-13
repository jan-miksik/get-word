'use client';

import React, { useEffect, useRef, useState } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import {
  checkAudioUrlAvailable,
  getCachedAudioUrlAvailability,
} from '@/lib/audio-availability';
import { STAGES, type NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import { matchAnswer } from '@/lib/minigames';
import {
  flipSide,
  getWordAudioSrcsBySide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type WordSide,
} from '@/components/games/types';
import { getTypingTargetLanguageLabel } from '@/components/games/target-language-label';
import { CustomStagePopover } from '@/components/word-card/CustomStagePopover';
import { getWordTextSize } from '@/components/word-card/helpers';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { useI18n } from '@/components/I18nProvider';
import type { TypingWriteIn } from '@/features/learning/state/preferences';

export type TypingOutcome = 'known' | 'stay' | 'unknown';

interface TypingResult {
  match: 'exact' | 'close' | 'wrong';
  outcome: TypingOutcome;
  points: number;
}

interface TypingStudyCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: LearningRole;
  writeIn: TypingWriteIn;
  audioPromptEnabled: boolean;
  prefillPunctuation: boolean;
  /** Stable per-appearance coin flip (getWordDisplayMode); picks the side in 'both'. */
  modeIndex: 0 | 1;
  onOutcome: (outcome: TypingOutcome, points: number) => void;
  onCustomStage?: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  fullscreen?: boolean;
  autoFocus?: boolean;
}

// Whitespace and any Unicode punctuation (covers typographic quotes/apostrophes).
const PREFILL_CHAR_RE = /[\s\p{P}]/u;
const PREFILL_STRIP_RE = /[\s\p{P}]+/gu;

// Case/accent-insensitive single-character compare for per-slot feedback.
const normalizeChar = (ch: string) =>
  ch.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

// The game-typing-* / game-input / game-hint-btn / game-feedback styles read
// these vars, normally provided by .game-card. The typing study card reuses the
// input mechanics without the game frame, so it supplies the palette itself.
const GAME_PALETTE = {
  '--game-surface': '#F4EFE2',
  '--game-surface-hover': '#FFF8E8',
  '--game-ink': '#2A2218',
  '--game-ink-soft': '#6B5E48',
  '--game-accent': '#1E6FA8',
  '--game-correct': '#15803D',
  '--game-wrong': '#B91C1C',
} as React.CSSProperties;

function computeOutcome(match: 'exact' | 'close' | 'wrong', hints: number): TypingResult {
  if (match === 'exact' && hints === 0) return { match, outcome: 'known', points: 2 };
  if ((match === 'exact' || match === 'close') && hints <= 1) {
    return { match, outcome: 'stay', points: 1 };
  }
  return { match, outcome: 'unknown', points: 0 };
}

export function TypingStudyCard({
  word,
  progress,
  role,
  writeIn,
  audioPromptEnabled,
  prefillPunctuation,
  modeIndex,
  onOutcome,
  onCustomStage,
  fullscreen = false,
  autoFocus = false,
}: TypingStudyCardProps) {
  const { language, t } = useI18n();
  // value holds only the user's characters for editable slots (fixed
  // punctuation/space slots are never part of it).
  const [value, setValue] = useState('');
  const [result, setResult] = useState<TypingResult | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [hasAudioPlaybackError, setHasAudioPlaybackError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isComposingRef = useRef(false);
  const hintsRef = useRef(0);
  const continuedRef = useRef(false);

  const foreignSide: WordSide = learningSideForRole(role);
  const answerSide: WordSide =
    writeIn === 'foreign'
      ? foreignSide
      : writeIn === 'known'
        ? knownSideForRole(role)
        : modeIndex === 0
          ? foreignSide
          : knownSideForRole(role);
  const promptTextSide: WordSide = flipSide(answerSide);

  const correctAnswer = getWordTextBySide(word, answerSide).trim().normalize('NFC');
  const slots = Array.from(correctAnswer);
  const fixedFlags = slots.map((ch) => prefillPunctuation && PREFILL_CHAR_RE.test(ch));
  const editableSlotIndices = slots
    .map((_, idx) => idx)
    .filter((idx) => !fixedFlags[idx]);
  const editableCount = editableSlotIndices.length;

  const promptText = getWordTextBySide(word, promptTextSide);
  // The audio prompt is always the foreign side: dictation when the user types
  // the foreign word, listening prompt when they type the known one.
  const promptAudioSrcs = getWordAudioSrcsBySide(word, foreignSide);
  const learningAudioSrcs = getWordAudioSrcsBySide(word, foreignSide);

  const [hasVerifiedPromptAudio, setHasVerifiedPromptAudio] = useState<boolean>(() =>
    promptAudioSrcs.some((src) => getCachedAudioUrlAvailability(src) === true),
  );

  const promptAudioSrcsKey = promptAudioSrcs.join('|');
  useEffect(() => {
    let cancelled = false;
    if (!audioPromptEnabled || promptAudioSrcs.length === 0) {
      setHasVerifiedPromptAudio(false);
      return () => {
        cancelled = true;
      };
    }
    setHasVerifiedPromptAudio(
      promptAudioSrcs.some((src) => getCachedAudioUrlAvailability(src) === true),
    );
    void (async () => {
      for (const src of promptAudioSrcs) {
        if (await checkAudioUrlAvailable(src)) {
          if (!cancelled) setHasVerifiedPromptAudio(true);
          return;
        }
        if (cancelled) return;
      }
      if (!cancelled) setHasVerifiedPromptAudio(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPromptEnabled, promptAudioSrcsKey]);

  const usesAudioPrompt =
    audioPromptEnabled && hasVerifiedPromptAudio && !hasAudioPlaybackError;

  useEffect(() => {
    // focus() raises onFocus, which flips isFocused.
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Move focus to the continue overlay so Enter/Space advances and the mobile
  // keyboard can close (the input is disabled once a result exists).
  useEffect(() => {
    if (result) overlayRef.current?.focus();
  }, [result]);

  const playClip = (audioSrc: string | string[] | null) =>
    playUserInitiatedAudio(audioRef, audioSrc);

  const replayPrompt = async () => {
    const playback = await playClip(promptAudioSrcs);
    if (playback.ok || playback.interrupted) return;
    setHasAudioPlaybackError(true);
  };

  const typedChars = Array.from(value);

  const buildMergedAnswer = (typed: string[]): string => {
    let editableIdx = 0;
    return slots
      .map((ch, idx) => {
        if (fixedFlags[idx]) return ch;
        const typedChar = typed[editableIdx] ?? '';
        editableIdx += 1;
        return typedChar;
      })
      .join('');
  };

  const finishCheck = (nextValue: string) => {
    if (result !== null || isComposingRef.current) return;
    const typed = Array.from(nextValue);
    if (typed.length < editableCount || editableCount === 0) return;
    const merged = typed.length > editableCount ? nextValue : buildMergedAnswer(typed);
    const match = matchAnswer(merged, correctAnswer);
    const nextResult = computeOutcome(match, hintsRef.current);
    setResult(nextResult);
    if (match === 'exact' || match === 'close') {
      void playClip(learningAudioSrcs);
    }
  };

  const applyInputValue = (raw: string) => {
    if (result !== null) return;
    if (isComposingRef.current) {
      // Leave IME composition text untouched; it is sanitized on compositionend.
      setValue(raw);
      return;
    }
    const sanitized = prefillPunctuation
      ? raw.normalize('NFC').replace(PREFILL_STRIP_RE, '')
      : raw.normalize('NFC');
    setValue(sanitized);
    finishCheck(sanitized);
  };

  const updateCaret = (target: HTMLInputElement) => {
    setCaretIndex(target.selectionStart ?? value.length);
  };

  // Each press fills the next still-missing letter of the answer. Fixed
  // (prefilled) slots are not part of the typed value; bare spaces (prefill
  // off) are filled without consuming a hint, mirroring the quiz behavior.
  const revealNextLetter = () => {
    if (result !== null) return;
    const typed = Array.from(value);
    let caretPos = -1;
    for (let editableIdx = 0; editableIdx < editableCount; editableIdx += 1) {
      const expected = slots[editableSlotIndices[editableIdx]];
      if ((typed[editableIdx] ?? '') === expected) continue;
      typed[editableIdx] = expected;
      if (expected === ' ') continue;
      hintsRef.current += 1;
      caretPos = editableIdx + 1;
      break;
    }
    if (caretPos < 0) return;
    const nextValue = typed.join('');
    setValue(nextValue);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        const pos = Math.min(caretPos, nextValue.length);
        input.setSelectionRange(pos, pos);
        updateCaret(input);
      }
    });
    finishCheck(nextValue);
  };

  const hintExhausted = editableSlotIndices.every(
    (slotIdx, editableIdx) => (typedChars[editableIdx] ?? '') === slots[slotIdx],
  );

  const handleContinue = () => {
    if (!result || continuedRef.current) return;
    continuedRef.current = true;
    onOutcome(result.outcome, result.points);
  };

  // Stage context for the "repeat in" popover, mirroring WordCard.
  const stageIndex = progress.stageIndex || 0;
  const clampedStageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1));
  const stageGroup =
    clampedStageIndex === 0 ? 'new' :
    clampedStageIndex <= 2 ? 'fresh' :
    clampedStageIndex <= 5 ? 'learning' :
    clampedStageIndex <= 6 ? 'seasoned' :
    'mastered';

  const targetLanguageLabel = getTypingTargetLanguageLabel(word, answerSide, t, language);
  const showWriteInBadge = writeIn !== 'foreign';

  // Which slot the caret sits in (fixed slots are skipped by mapping the caret
  // through the editable slot list).
  const activeSlotIndex =
    caretIndex < editableCount ? editableSlotIndices[caretIndex] : -1;

  // Build the visible mask: one span per character, grouped into non-breaking
  // words so a long sentence wraps at spaces instead of mid-word.
  let editableRenderIdx = -1;
  const maskGroups: React.ReactNode[] = [];
  let currentWord: React.ReactNode[] = [];
  let wordKey = 0;
  const flushWord = () => {
    if (currentWord.length === 0) return;
    maskGroups.push(
      <span key={`w-${wordKey++}`} className="game-typing-word">
        {currentWord}
      </span>,
    );
    currentWord = [];
  };
  slots.forEach((ch, idx) => {
    const isFixed = fixedFlags[idx];
    if (!isFixed) editableRenderIdx += 1;
    const typedChar = isFixed ? ch : (typedChars[editableRenderIdx] ?? '');
    const isSpace = ch === ' ';
    const isActive = idx === activeSlotIndex;
    // Once checked, colour each character: green when it matches the expected
    // letter, highlighted red when it is wrong or missing.
    const charState =
      result === null || isSpace
        ? ''
        : normalizeChar(typedChar) === normalizeChar(ch)
          ? 'game-typing-slot--correct'
          : 'game-typing-slot--bad';
    const span = (
      <span
        key={`ch-${idx}`}
        className={[
          'game-typing-slot',
          isSpace ? 'game-typing-slot--space' : '',
          isFixed && !isSpace && result === null ? 'opacity-60' : '',
          charState,
          isActive ? 'is-active' : '',
        ].filter(Boolean).join(' ')}
      >
        {typedChar ? typedChar : '_'}
      </span>
    );
    if (isSpace) {
      flushWord();
      maskGroups.push(span);
    } else {
      currentWord.push(span);
    }
  });
  flushWord();

  const resultLabels: Record<'exact' | 'close' | 'wrong', React.ReactNode> = {
    exact: `✓ ${t('game.perfect')}`,
    close: (
      <>
        ~ {t('game.close')} <strong>{correctAnswer}</strong>
      </>
    ),
    wrong: (
      <>
        ✗ {t('game.correctAnswer')} <strong>{correctAnswer}</strong>
      </>
    ),
  };

  return (
    <article
      className={`phrase-card relative ${fullscreen ? 'word-card--fullscreen' : ''}`}
      style={GAME_PALETTE}
      data-word-id={word.id}
      data-stage-group={stageGroup}
    >
      <div className="word-card-content flex flex-col gap-4">
        {showWriteInBadge && (
          <div className="game-badge self-center">
            {`⌨️ ${t('game.typeIn', { language: targetLanguageLabel })}`}
          </div>
        )}
        {usesAudioPrompt ? (
          <div className="flex justify-center py-2">
            <button
              type="button"
              className="!h-16 !min-h-16 !w-16 !min-w-16 flex items-center justify-center !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!bg-[#1E6FA8] hover:!border-[#1E6FA8] hover:!text-[#F4EFE2] active:!bg-[#1E6FA8] active:!border-[#1E6FA8] active:!text-[#F4EFE2] cursor-pointer"
              onClick={replayPrompt}
              aria-label={t('game.replayPromptAudio')}
            >
              <SpeakerIcon size={23} />
            </button>
          </div>
        ) : (
          <div
            className={`text-center font-bold leading-tight text-[#2A2218] ${getWordTextSize(promptText.length)}`}
          >
            {promptText}
          </div>
        )}
        <div className="game-typing-area">
          <div
            className={[
              'game-typing-input-wrap',
              result ? `game-typing-input-wrap--${result.match}` : '',
              isFocused ? 'is-focused' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="game-typing-mask" aria-hidden="true">
              {maskGroups}
            </div>
            <input
              ref={inputRef}
              type="text"
              className={`game-input game-input--masked${result ? ` game-input--${result.match}` : ''}`}
              placeholder={t('game.typeTranslation')}
              value={value}
              onChange={(e) => {
                applyInputValue(e.target.value);
                updateCaret(e.target);
              }}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                isComposingRef.current = false;
                applyInputValue(e.currentTarget.value);
                updateCaret(e.currentTarget);
              }}
              onClick={(e) => updateCaret(e.currentTarget)}
              onKeyUp={(e) => updateCaret(e.currentTarget)}
              onSelect={(e) => updateCaret(e.currentTarget)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={result !== null}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
          {result === null && (
            <div className="game-typing-actions">
              <button
                type="button"
                className="game-hint-btn"
                onClick={revealNextLetter}
                disabled={hintExhausted}
              >
                {t('game.hint')}
              </button>
            </div>
          )}
        </div>
        {result !== null && (
          <div className={`game-feedback game-feedback--${result.match}`}>
            {resultLabels[result.match]}
          </div>
        )}
      </div>

      <div className="card-actions relative mt-8">
        <div className="flex w-full justify-center">
          <div className="w-full max-w-[240px]">
            <CustomStagePopover
              clampedStageIndex={clampedStageIndex}
              onCustomStage={onCustomStage}
            />
          </div>
        </div>
      </div>

      {result !== null && (
        <button
          ref={overlayRef}
          type="button"
          className="absolute inset-0 z-10 flex flex-col justify-end cursor-pointer rounded-xl border-none bg-transparent p-0 text-left transition-opacity duration-300"
          onClick={handleContinue}
        >
          <span
            className="flex items-center justify-center px-4 py-3.5 rounded-b-xl max-sm:rounded-b-none bg-[#2A2218] text-[#F4EFE2] border-t-2 border-[#2A2218] shadow-[0_-6px_18px_rgba(0,0,0,0.18)] w-full"
            style={{ animation: 'typing-overlay-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <span className="text-sm font-bold uppercase tracking-[0.08em]">
              {t('card.tapToContinue')} →
            </span>
          </span>
          <style>{`
            @keyframes typing-overlay-slide {
              0% { opacity: 0; transform: translateY(6px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </button>
      )}
    </article>
  );
}
