'use client';

import React, { useEffect, useRef, useState } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import { STAGES, type NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import {
  getAcceptedAnswerCandidates,
  matchAnswerAgainstCandidates,
  requiresExplicitTypingCheck,
} from '@/lib/minigames';
import { PREFILL_CHAR_RE, splitGraphemes } from '@/lib/answer-normalization';
import {
  flipSide,
  getWordAcceptedAnswersBySide,
  getWordAudioSrcsBySide,
  getWordLanguageCodeForSide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type WordSide,
} from '@/components/games/types';
import { getTypingTargetLanguageLabel } from '@/components/games/target-language-label';
import { CustomStagePopover } from '@/components/word-card/CustomStagePopover';
import { formatNextReviewHint, getWordTextSize } from '@/components/word-card/helpers';
import { ClipboardCheckIcon } from '@/components/icons/ClipboardCheckIcon';
import { LightbulbIcon } from '@/components/icons/LightbulbIcon';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { useI18n } from '@/components/I18nProvider';
import type { TypingWriteIn } from '@/features/learning/state/preferences';
import {
  limitMemoryHookLength,
  MEMORY_HOOK_MAX_LENGTH,
} from '@/features/learning/state/memoryHooks';

export type TypingOutcome = 'known' | 'stay' | 'unknown';

interface TypingResult {
  match: 'exact' | 'close' | 'wrong';
  matchedAnswer: string;
  isAlternative: boolean;
  outcome: TypingOutcome;
  points: number;
}
type TypingOutcomeResult = Pick<TypingResult, 'match' | 'outcome' | 'points'>;

interface TypingStudyCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: LearningRole;
  writeIn: TypingWriteIn;
  audioPromptEnabled: boolean;
  prefillPunctuation: boolean;
  /** Stable per-appearance coin flip (getWordDisplayMode); picks the side in 'both'. */
  modeIndex: 0 | 1;
  /** Fires as soon as the answer is checked, so the score updates immediately. */
  onScore?: (points: number) => void;
  /** Fires on tap-to-continue; SR stage moves only when the card advances. */
  onOutcome: (outcome: TypingOutcome) => void;
  onCustomStage?: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  fullscreen?: boolean;
  autoFocus?: boolean;
  memoryHook?: string;
  suggestedHook?: string;
  onMemoryHookChange?: (hook: string) => void;
  showMemoryHook?: boolean;
}

// Strip variant of the shared PREFILL_CHAR_RE (lib/answer-normalization.ts).
const PREFILL_STRIP_RE = /[\s\p{P}]+/gu;

// Languages typed via multi-keystroke schemes (Vietnamese Telex/VNI: "chào" is
// c-h-a-o-f, the tone key arriving after every slot is already filled).
// Auto-checking on the last slot would fire mid-word there, so these answers
// are confirmed explicitly with the check button / Enter.
const MULTI_KEY_INPUT_LANGUAGES = new Set(['vi']);

const usesMultiKeyInput = (code: string | null): boolean =>
  code !== null && MULTI_KEY_INPUT_LANGUAGES.has(code.toLowerCase().split('-')[0]);

// Case/accent-insensitive single-character compare for per-slot feedback.
// Mirrors matchAnswer's strip (incl. đ→d) so slot colours match the verdict.
const normalizeChar = (ch: string) =>
  ch.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/đ/g, 'd');

// Three-state slot verdict, mirroring matchAnswer: exact (case-insensitive)
// → correct, accent-only difference → close, anything else → bad.
const slotState = (typed: string, expected: string): 'correct' | 'close' | 'bad' => {
  if (typed.toLowerCase() === expected.toLowerCase()) return 'correct';
  if (normalizeChar(typed) === normalizeChar(expected)) return 'close';
  return 'bad';
};

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

function computeOutcome(match: 'exact' | 'close' | 'wrong', hints: number): TypingOutcomeResult {
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
  onScore,
  onOutcome,
  onCustomStage,
  fullscreen = false,
  autoFocus = false,
  memoryHook = '',
  suggestedHook = '',
  onMemoryHookChange,
  showMemoryHook = false,
}: TypingStudyCardProps) {
  const { language, t } = useI18n();
  // value holds only the user's characters for editable slots (fixed
  // punctuation/space slots are never part of it).
  const [value, setValue] = useState('');
  const [result, setResult] = useState<TypingResult | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const compactContinueRef = useRef<HTMLButtonElement>(null);
  const hookInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isComposingRef = useRef(false);
  const hintsRef = useRef(0);
  const continuedRef = useRef(false);
  const [editingHook, setEditingHook] = useState(false);
  const [hookValue, setHookValue] = useState(memoryHook);

  useEffect(() => {
    setHookValue(memoryHook);
  }, [memoryHook]);

  useEffect(() => {
    if (!showMemoryHook) setEditingHook(false);
  }, [showMemoryHook]);

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
  // Telex-style answers keep changing after the slot count is full, so the
  // check is explicit (button / Enter) instead of firing on the last slot.
  const correctAnswer = getWordTextBySide(word, answerSide).trim().normalize('NFC');
  const answerCandidates = getAcceptedAnswerCandidates(
    correctAnswer,
    getWordAcceptedAnswersBySide(word, answerSide),
  );
  // Alternatives that fit the primary's slot mask (same grapheme count, same
  // punctuation slots) keep the masked input; only an incompatible alternative
  // forces the free-text fallback (and, via requiresExplicitTypingCheck, an
  // explicit check instead of auto-check on the last slot).
  const useFreeAnswerInput = requiresExplicitTypingCheck(answerCandidates);
  const manualCheck =
    usesMultiKeyInput(getWordLanguageCodeForSide(word, answerSide)) || useFreeAnswerInput;
  const displayedAnswer = result?.matchedAnswer ?? correctAnswer;
  const slots = splitGraphemes(displayedAnswer);
  const fixedFlags = slots.map((ch) => prefillPunctuation && PREFILL_CHAR_RE.test(ch));
  const editableSlotIndices = slots
    .map((_, idx) => idx)
    .filter((idx) => !fixedFlags[idx]);
  const editableCount = editableSlotIndices.length;

  const promptText = getWordTextBySide(word, promptTextSide);
  // Known-language meaning, shown as a subtitle under the audio prompt so a
  // pure-dictation round still tells the user what the word means. Hidden when
  // the known side IS the answer (writeIn 'known', or 'both' with a known
  // answer) — showing it there would reveal what they must type.
  const knownSide = knownSideForRole(role);
  const knownMeaningText =
    answerSide === knownSide ? '' : getWordTextBySide(word, knownSide).trim();
  // The audio prompt is always the foreign side: dictation when the user types
  // the foreign word, listening prompt when they type the known one.
  const promptAudioSrcs = getWordAudioSrcsBySide(word, foreignSide);
  // The card's presentation must never depend on a late network probe. A slow
  // or failing audio gateway used to flip an already-visible card between its
  // text and audio layouts. Keep the chosen layout stable for the whole card;
  // playback itself can still try every configured fallback source.
  const hasAudioSource = promptAudioSrcs.length > 0;
  const usesAudioPrompt = audioPromptEnabled && hasAudioSource;

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

  // Move focus to the continue control so Enter/Space advances and the mobile
  // keyboard can close once the input is disabled.
  useEffect(() => {
    if (!result) return;
    compactContinueRef.current?.focus();
  }, [result]);

  const playClip = (audioSrc: string | string[] | null) =>
    playUserInitiatedAudio(audioRef, audioSrc);

  const replayPrompt = () => {
    void playClip(promptAudioSrcs);
  };

  const typedChars = splitGraphemes(value);
  const minimumManualAnswerLength = useFreeAnswerInput
    ? Math.min(
        ...answerCandidates
          .map((candidate) => splitGraphemes(candidate.answer.trim()).length)
          .filter((length) => length > 0),
      )
    : editableCount;
  const isManualAnswerComplete =
    minimumManualAnswerLength > 0 && typedChars.length >= minimumManualAnswerLength;

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

  const evaluateAnswer = (nextValue: string) => {
    if (result !== null || isComposingRef.current) return;
    const typed = splitGraphemes(nextValue);
    if (typed.length === 0 || editableCount === 0) return;
    const merged =
      useFreeAnswerInput || typed.length > editableCount ? nextValue : buildMergedAnswer(typed);
    const match = matchAnswerAgainstCandidates(merged, answerCandidates);
    const nextOutcome = computeOutcome(match.verdict, hintsRef.current);
    const nextResult = {
      ...nextOutcome,
      matchedAnswer: match.matchedAnswer,
      isAlternative: match.isAlternative,
    };
    setResult(nextResult);
    // Score lands the moment the answer is checked; only the SR stage waits
    // for the continue tap.
    if (nextResult.points > 0) onScore?.(nextResult.points);
  };

  // Auto path: fires when the last editable slot is filled. Manual-check
  // languages skip this and confirm via submitCheck instead.
  const finishCheck = (nextValue: string) => {
    if (manualCheck) return;
    if (splitGraphemes(nextValue).length < editableCount) return;
    evaluateAnswer(nextValue);
  };

  const submitCheck = () => {
    if (!value.trim() || (manualCheck && !isManualAnswerComplete)) return;
    evaluateAnswer(value);
  };

  const applyInputValue = (raw: string) => {
    if (result !== null) return;
    if (isComposingRef.current) {
      // Leave IME composition text untouched; it is sanitized on compositionend.
      setValue(raw);
      return;
    }
    const sanitized = prefillPunctuation && !useFreeAnswerInput
      ? raw.normalize('NFC').replace(PREFILL_STRIP_RE, '')
      : raw.normalize('NFC');
    setValue(sanitized);
    finishCheck(sanitized);
  };

  const updateCaret = (target: HTMLInputElement) => {
    const selectionStart = target.selectionStart ?? target.value.length;
    setCaretIndex(splitGraphemes(target.value.slice(0, selectionStart)).length);
  };

  // The native transparent input cannot map pointer positions reliably once
  // prefilled spaces are omitted from its value. Use the visible slot geometry
  // instead, and select an existing character so the next keystroke replaces it.
  const selectSlotFromPointer = (
    target: HTMLInputElement,
    clientX: number,
    clientY: number,
  ) => {
    const wrap = target.closest('.game-typing-input-wrap');
    const slotElements = Array.from(
      wrap?.querySelectorAll<HTMLElement>('[data-editable-index]') ?? [],
    );
    if (slotElements.length === 0) {
      updateCaret(target);
      return;
    }

    let closest: HTMLElement | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const slot of slotElements) {
      const rect = slot.getBoundingClientRect();
      const dx = clientX < rect.left
        ? rect.left - clientX
        : clientX > rect.right
          ? clientX - rect.right
          : 0;
      const dy = clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0;
      const distance = (dy * dy * 4) + (dx * dx);
      if (distance < closestDistance) {
        closest = slot;
        closestDistance = distance;
      }
    }

    const editableIndex = Number(closest?.dataset.editableIndex);
    if (!Number.isInteger(editableIndex)) {
      updateCaret(target);
      return;
    }
    const valueChars = splitGraphemes(target.value);
    const selectionStart = valueChars.slice(0, editableIndex).join('').length;
    const selectedChar = valueChars[editableIndex] ?? '';
    const selectionEnd = selectionStart + selectedChar.length;
    target.setSelectionRange(selectionStart, selectionEnd);
    setCaretIndex(editableIndex);
  };

  // Each press fills the next still-missing letter of the answer. Fixed
  // (prefilled) slots are not part of the typed value; bare spaces (prefill
  // off) are filled without consuming a hint, mirroring the quiz behavior.
  const revealNextLetter = () => {
    if (result !== null) return;
    const typed = splitGraphemes(value);
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
        // caretPos counts graphemes; setSelectionRange expects UTF-16 units.
        const pos = typed.slice(0, caretPos).join('').length;
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
    onOutcome(result.outcome);
  };

  // The continue bar no longer covers the whole card, so the stage popover is
  // reachable after the check too — share the once-only guard so a popover
  // pick and the continue tap can't both advance the card.
  const handleCustomStage = (stageIndex: number, opts?: { noRepeat?: boolean }) => {
    if (result !== null) {
      if (continuedRef.current) return;
      continuedRef.current = true;
    }
    onCustomStage?.(stageIndex, opts);
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
  const nextStageIndex =
    result?.outcome === 'known'
      ? Math.min(clampedStageIndex + 1, STAGES.length - 1)
      : result?.outcome === 'unknown'
        ? Math.max(clampedStageIndex - 1, 0)
        : clampedStageIndex;
  const continueHint = formatNextReviewHint(STAGES[nextStageIndex]?.intervalMs ?? 0, t);

  const targetLanguageLabel = getTypingTargetLanguageLabel(word, answerSide, t, language);
  const showWriteInBadge = writeIn !== 'foreign';
  const showTypingAudio = hasAudioSource && !usesAudioPrompt;
  const displayHook = memoryHook || (suggestedHook ? `💡 ${suggestedHook}` : `💭 ${t('card.memoryHookPlaceholder')}`);

  const startEditingHook = () => {
    if (!onMemoryHookChange) return;
    setEditingHook(true);
    hookInputRef.current?.focus();
  };

  const finishEditingHook = () => {
    setEditingHook(false);
    onMemoryHookChange?.(hookValue);
  };

  const cancelEditingHook = () => {
    setEditingHook(false);
    setHookValue(memoryHook);
  };

  const isMobileLayout = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(max-width: 767px)').matches === true;

  // A single tap opened the editor too easily on touch layouts (stray taps
  // started typing over the hook), so mobile needs a quick double tap. The
  // dblclick event is unreliable on touch, hence the manual timestamp check.
  const lastHookTapAtRef = useRef(0);
  const handleHookTap = () => {
    if (!isMobileLayout()) {
      if (!memoryHook) startEditingHook();
      return;
    }
    const isSecondTap = Date.now() - lastHookTapAtRef.current < 350;
    lastHookTapAtRef.current = Date.now();
    if (isSecondTap) startEditingHook();
  };

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
  // After a non-perfect check every slot gains a small second row: the
  // expected character under each wrong/close letter (blank elsewhere, kept
  // for equal slot heights so wrapped lines stay aligned).
  const showCorrections = result !== null && result.match !== 'exact';
  slots.forEach((ch, idx) => {
    const isFixed = fixedFlags[idx];
    if (!isFixed) editableRenderIdx += 1;
    const typedChar = isFixed ? ch : (typedChars[editableRenderIdx] ?? '');
    const isSpace = ch === ' ';
    const isActive = idx === activeSlotIndex;
    // Once checked, colour each character: green when it matches exactly,
    // yellow when only the accent differs, highlighted red when it is wrong
    // or missing.
    const state = result === null || isSpace ? null : slotState(typedChar, ch);
    const reservesCorrectionRow = true;
    const needsCorrection = showCorrections && state !== null && state !== 'correct';
    const span = (
      <span
        key={`ch-${idx}`}
        data-editable-index={isFixed ? undefined : editableRenderIdx}
        className={[
          'game-typing-slot',
          isSpace ? 'game-typing-slot--space' : 'w-[1ch] min-w-[1ch]',
          isFixed && !isSpace && result === null ? 'opacity-60' : '',
          state ? `game-typing-slot--${state}` : '',
          isActive
            ? 'is-active after:!left-0 after:!w-[2px] after:!translate-x-0 after:!rounded-none after:!bg-[#2A2218]'
            : '',
          reservesCorrectionRow ? 'flex-col items-center' : '',
        ].filter(Boolean).join(' ')}
      >
        <span>{typedChar ? typedChar : '_'}</span>
        {reservesCorrectionRow && (
          <span
            className={`${showCorrections ? 'game-typing-correction' : 'game-typing-correction-placeholder'} text-[0.58em] font-bold leading-[1.2]${needsCorrection ? '' : ' invisible'}`}
          >
            {needsCorrection ? ch : '\u00A0'}
          </span>
        )}
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
        ~ {t('game.close')} <strong>{result?.matchedAnswer ?? correctAnswer}</strong>
      </>
    ),
    wrong: (
      <>
        ✗ {t('game.correctAnswer')} <strong>{result?.matchedAnswer ?? correctAnswer}</strong>
      </>
    ),
  };
  const feedbackToneClass =
    result?.match === 'close'
      ? '!border-[#C28A24] !bg-[#FFF0BD] !text-[#5B3A00] shadow-[0_2px_0_rgba(91,58,0,0.12)]'
      : result?.match === 'wrong'
        ? '!border-[#B91C1C]/30 !bg-[#B91C1C]/10 !text-[#8F1515]'
        : '!text-[#187A43]';

  const hintButton = result === null ? (
    <button
      type="button"
      className="game-hint-btn !flex !h-11 !min-h-11 !w-11 !min-w-11 !items-center !justify-center !rounded-full !border-0 !bg-[#F4EFE2] !p-0 !text-2xl !font-bold !normal-case !tracking-normal !text-[#2A2218] shadow-none hover:!bg-[#FFF8E8] disabled:!opacity-50"
      onClick={revealNextLetter}
      disabled={hintExhausted}
      aria-label={t('game.hint')}
      title={t('game.hint')}
    >
      <LightbulbIcon size={24} />
    </button>
  ) : null;

  return (
    <article
      className={`phrase-card relative ${fullscreen ? 'word-card--fullscreen' : ''} ${editingHook ? 'phrase-card--editing-hook' : ''}`}
      style={GAME_PALETTE}
      data-word-id={word.id}
      data-stage-group={stageGroup}
    >
      <div className={`word-card-content flex flex-col gap-2 md:[@media(max-height:800px)]:gap-1 ${fullscreen ? 'md:translate-y-4 md:[@media(max-height:800px)]:!translate-y-0' : ''} ${editingHook ? 'word-card-content--editing-hook' : ''}`}>
        <div
          role={result ? 'status' : undefined}
          aria-hidden={result ? undefined : true}
          className={`game-feedback self-center min-h-[3.25rem] w-[min(34rem,calc(100vw-2rem))] !justify-center !border !border-transparent !px-3 !py-1.5 text-center !text-[1rem] leading-tight sm:!text-[1.1rem] md:[@media(max-height:800px)]:min-h-10 md:[@media(max-height:800px)]:!py-1 [&_strong]:font-extrabold ${result ? `game-feedback--${result.match} ${feedbackToneClass}` : 'invisible'}`}
        >
          {result ? resultLabels[result.match] : '\u00A0'}
        </div>
        {showWriteInBadge && (
          <div className="game-badge self-center">
            {`⌨️ ${t('game.typeIn', { language: targetLanguageLabel })}`}
          </div>
        )}
        {usesAudioPrompt ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              type="button"
              className="!h-16 !min-h-16 !w-16 !min-w-16 flex items-center justify-center !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!bg-[#1E6FA8] hover:!border-[#1E6FA8] hover:!text-[#F4EFE2] active:!bg-[#1E6FA8] active:!border-[#1E6FA8] active:!text-[#F4EFE2] cursor-pointer"
              onClick={replayPrompt}
              aria-label={t('game.replayPromptAudio')}
            >
              <SpeakerIcon size={23} />
            </button>
            {knownMeaningText && (
              <div className="text-center text-lg font-medium text-[#6B5E48]">
                {knownMeaningText}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <div
              className={`text-center font-bold leading-tight text-[#2A2218] md:[@media(max-height:800px)]:!text-[2rem] ${getWordTextSize(promptText.length)}`}
            >
              {promptText}
            </div>
          </div>
        )}
        <div className="game-typing-area !gap-2">
          <div className="relative mx-auto w-fit max-w-full">
            <div className={`min-w-0 mx-auto ${useFreeAnswerInput ? 'w-[min(26rem,calc(100vw-7rem))]' : 'w-fit max-w-full'}`}>
              {useFreeAnswerInput ? (
                <input
                  ref={inputRef}
                  type="text"
                  className={`w-full rounded-xl border-2 border-[#2A2218] bg-[#FFF8E8] px-4 py-2 text-center !text-[1.5rem] sm:!text-[2.5rem] font-bold text-[#2A2218] outline-none transition-colors focus:border-[#1E6FA8] disabled:opacity-80 ${
                    result ? `game-input--${result.match}` : ''
                  }`}
                  placeholder={t('game.typeTranslation')}
                  value={value}
                  onChange={(e) => applyInputValue(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    isComposingRef.current = false;
                    applyInputValue(e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isComposingRef.current) {
                      e.preventDefault();
                      submitCheck();
                    }
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={result !== null}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              ) : (
                <div
                  className={[
                    'game-typing-input-wrap !w-fit !max-w-full',
                    result ? `game-typing-input-wrap--${result.match}` : '',
                    isFocused ? 'is-focused' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {/* !text size must match the invisible input below so click→caret
                      mapping stays aligned with the visible letters. */}
                  <div className="game-typing-mask !px-2 !py-1 !text-[1.5rem] sm:!text-[2.5rem] md:[@media(max-height:800px)]:!min-h-[2.7em] md:[@media(max-height:800px)]:!text-[2rem]" aria-hidden="true">
                    {maskGroups}
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    className={`game-input game-input--masked selection:bg-transparent selection:text-transparent !px-2 !py-1 !text-[1.5rem] sm:!text-[2.5rem] md:[@media(max-height:800px)]:!text-[2rem]${result ? ` game-input--${result.match}` : ''}`}
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
                    onKeyDown={(e) => {
                      if (manualCheck && e.key === 'Enter' && !isComposingRef.current) {
                        e.preventDefault();
                        submitCheck();
                      }
                    }}
                    onClick={(e) => selectSlotFromPointer(e.currentTarget, e.clientX, e.clientY)}
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
              )}
            </div>
            {!manualCheck && (
              <div className={`mx-auto mt-3 min-h-11 w-11 md:absolute md:left-[calc(100%+2.5rem)] md:top-1/2 md:mt-0 md:min-h-0 md:-translate-y-1/2 ${result ? 'invisible' : ''}`}>
                {hintButton}
              </div>
            )}
            {manualCheck && (
              <div className={`game-typing-actions mx-auto mt-3 !w-fit !gap-3 md:absolute md:left-[calc(100%+1.5rem)] md:top-1/2 md:mt-0 md:-translate-y-1/2 ${result ? 'invisible pointer-events-none' : ''}`}>
                {hintButton}
                <button
                  type="button"
                  className="game-check-btn !flex !h-11 !min-h-11 !w-11 !min-w-11 items-center justify-center !rounded-full !p-0 disabled:cursor-default disabled:opacity-50"
                  onClick={submitCheck}
                  disabled={!isManualAnswerComplete}
                  aria-label={t('game.check')}
                  title={t('game.check')}
                >
                  <ClipboardCheckIcon size={22} />
                </button>
              </div>
            )}
          </div>
        </div>

        {showMemoryHook && (
          <div className={`memory-hook-container mt-1 mb-0 ${editingHook ? 'editing' : ''}`}>
            <div
              className="memory-hook-display relative cursor-pointer touch-manipulation select-none max-sm:w-full !text-[#2A2218] hover:!bg-[#2A2218]/5"
              data-lang="memory-hook"
              onDoubleClick={startEditingHook}
              onClick={handleHookTap}
            >
              <span className={`memory-hook-text relative inline-block min-h-[1.4em] !text-[#2A2218] ${!memoryHook ? 'opacity-60 italic' : ''}`}>
                {displayHook}
              </span>
            </div>
            <input
              ref={hookInputRef}
              type="text"
              className="memory-hook-input !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] placeholder:!text-[#2A2218]/50 focus:!border-[#1E6FA8] focus:!shadow-none"
              placeholder={t('card.memoryHookInput')}
              value={hookValue}
              maxLength={MEMORY_HOOK_MAX_LENGTH}
              onChange={(e) => setHookValue(limitMemoryHookLength(e.target.value))}
              onBlur={finishEditingHook}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  finishEditingHook();
                } else if (e.key === 'Escape') {
                  cancelEditingHook();
                }
              }}
            />
          </div>
        )}
      </div>

      <div className="card-actions relative mt-6 md:[@media(max-height:800px)]:!mt-2">
        {showTypingAudio && (
          <button
            type="button"
            className="audio-btn audio-btn--floating !h-16 !min-h-16 !w-16 !min-w-16 !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!border-[#1E6FA8] hover:!bg-[#1E6FA8] hover:!text-[#F4EFE2] active:!border-[#1E6FA8] active:!bg-[#1E6FA8] active:!text-[#F4EFE2] max-md:!top-[-90px] md:[@media(max-height:800px)]:!top-[-82px]"
            onClick={replayPrompt}
            aria-label={t('card.playAudio')}
          >
            <SpeakerIcon size={23} />
          </button>
        )}
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 md:relative md:block md:h-[72px] md:!w-[33rem] md:!max-w-[33rem] md:[@media(max-height:800px)]:!h-14">
          {result && (
            <button
              ref={compactContinueRef}
              type="button"
              className="typing-continue-enter srs-btn srs-btn--okay mx-auto !hidden w-full !max-w-md items-center justify-center rounded-xl border-2 border-[#2A2218] bg-[#F4EFE2] px-3 text-[#2A2218] shadow-none hover:border-[#1E6FA8] hover:bg-[#1E6FA8] hover:text-[#F4EFE2] focus-visible:border-[#1E6FA8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E6FA8] md:absolute md:right-0 md:top-0 md:mx-0 md:!flex md:!h-[72px] md:!min-h-[72px] md:!w-64 md:!max-w-64 md:[@media(max-height:800px)]:!h-14 md:[@media(max-height:800px)]:!min-h-14"
              onClick={handleContinue}
            >
              <span className="srs-btn-copy">
                <span className="srs-btn-label">{t('card.continue')} →</span>
                <span className="srs-btn-hint !opacity-[0.55] !whitespace-normal max-sm:!text-[0.55rem] max-sm:!leading-[1.1] max-sm:!tracking-[0.04em]">{continueHint}</span>
              </span>
            </button>
          )}
          <div className={`mx-auto w-full !max-w-md max-md:!h-11 max-md:!w-32 max-md:!max-w-32 max-md:transition-transform max-md:duration-300 max-md:ease-out max-md:[&_.srs-btn]:!h-11 max-md:[&_.srs-btn]:!min-h-11 max-md:[&_.srs-btn]:!px-2 max-md:[&_.srs-btn]:!py-1 md:absolute md:left-0 md:top-0 md:mx-0 md:!h-[72px] md:!w-64 md:!max-w-64 md:transition-transform md:duration-500 md:ease-[cubic-bezier(0.22,1,0.36,1)] md:[&_.srs-btn]:!h-[72px] md:[&_.srs-btn]:!min-h-[72px] md:[@media(max-height:800px)]:!h-14 md:[@media(max-height:800px)]:[&_.srs-btn]:!h-14 md:[@media(max-height:800px)]:[&_.srs-btn]:!min-h-14 ${result ? 'max-md:-translate-y-[64px] md:translate-x-0' : 'max-md:-translate-y-1 md:translate-x-[136px]'}`}>
            <CustomStagePopover
              clampedStageIndex={clampedStageIndex}
              onCustomStage={handleCustomStage}
            />
          </div>
        </div>
        <style>{`
          @keyframes typing-continue-enter {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes typing-mobile-continue-enter {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .typing-continue-enter {
            animation: typing-continue-enter 240ms ease-out both;
            will-change: opacity;
          }

          .typing-mobile-continue-enter {
            animation: typing-mobile-continue-enter 260ms ease-out both;
          }

          @media (prefers-reduced-motion: reduce) {
            .typing-continue-enter,
            .typing-mobile-continue-enter {
              animation: none;
            }
          }
        `}</style>
      </div>
      {result && (
        <button
          type="button"
          className="typing-mobile-continue-enter absolute inset-x-0 bottom-0 z-10 flex min-h-[60px] w-full items-center justify-center border-0 border-t-2 border-[#2A2218] bg-[#2A2218] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-[#F4EFE2] shadow-[0_-6px_18px_rgba(0,0,0,0.18)] md:hidden"
          onClick={handleContinue}
        >
          <span className="srs-btn-copy gap-1">
            <span className="text-sm font-bold uppercase tracking-[0.08em]">{t('card.continue')} →</span>
            <span className="text-[0.58rem] font-bold uppercase leading-none tracking-[0.06em] opacity-60">{continueHint}</span>
          </span>
        </button>
      )}
    </article>
  );
}
