'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import { STAGES, type NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/features/sync/types';
import {
  getAcceptedAnswerCandidates,
  requiresExplicitTypingCheck,
} from '@/features/learning/minigames';
import { PREFILL_CHAR_RE, splitGraphemes } from '@/lib/answer-normalization';
import {
  flipSide,
  getWordAcceptedAnswersBySide,
  getWordAudioSrcsBySide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type WordSide,
} from './games/types';
import { getTypingTargetLanguageLabel } from './games/target-language-label';
import { CustomStagePopover } from './word-card/CustomStagePopover';
import { formatNextReviewHint, getWordTextSize } from './word-card/helpers';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { useI18n } from '@/components/I18nProvider';
import type { TypingWriteIn } from '@/features/learning/state/preferences';
import { TypingMemoryHook } from './typing-study/TypingMemoryHook';
import { TypingAnswerInput } from './typing-study/TypingAnswerInput';

import {
  evaluateTypingAnswer,
  getMinimumTypingAnswerLength,
  type TypingOutcome,
  type TypingResult,
} from './typing-study/evaluation';

export type { TypingOutcome } from './typing-study/evaluation';

interface TypingStudyCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: LearningRole;
  writeIn: TypingWriteIn;
  audioPromptEnabled: boolean;
  prefillPunctuation: boolean;
  playAudioAfterCheck?: boolean;
  checkButtonEnabled?: boolean;
  /** Stable per-appearance coin flip (getWordDisplayMode); picks the side in 'both'. */
  modeIndex: 0 | 1;
  /** Fires as soon as the answer is checked, so the score updates immediately. */
  onScore?: (points: number) => void;
  /** Fires on tap-to-continue; SR stage moves only when the card advances. */
  onOutcome: (outcome: TypingOutcome) => void;
  onCustomStage?: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  fullscreen?: boolean;
  autoFocus?: boolean;
  /** Overrides autoFocus on mobile; when omitted, autoFocus applies everywhere. */
  autoFocusOnMobile?: boolean;
  memoryHook?: string;
  suggestedHook?: string;
  onMemoryHookChange?: (hook: string) => void;
  showMemoryHook?: boolean;
}

// Strip variant of the shared PREFILL_CHAR_RE (lib/answer-normalization.ts).
const PREFILL_STRIP_RE = /[\s\p{P}]+/gu;

const isMobileLayout = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(max-width: 767px)').matches === true;

const isIOSBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// iOS does not consistently subtract the keyboard suggestion/accessory bar
// from visualViewport.height. Reserve enough room for that bar explicitly.
const MOBILE_KEYBOARD_ACCESSORY_RESERVE_PX = 64;

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

export function TypingStudyCard({
  word,
  progress,
  role,
  writeIn,
  audioPromptEnabled,
  prefillPunctuation,
  playAudioAfterCheck = false,
  checkButtonEnabled = false,
  modeIndex,
  onScore,
  onOutcome,
  onCustomStage,
  fullscreen = false,
  autoFocus = false,
  autoFocusOnMobile,
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
  const articleRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioButtonRef = useRef<HTMLButtonElement>(null);
  const compactContinueRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPressStartedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const audioTouchActiveRef = useRef(false);
  const isComposingRef = useRef(false);
  const hintsRef = useRef(0);
  const continuedRef = useRef(false);
  const autoFocusedWordIdRef = useRef<string | null>(null);

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
  const answerCandidates = getAcceptedAnswerCandidates(
    correctAnswer,
    getWordAcceptedAnswersBySide(word, answerSide),
  );
  // Alternatives that fit the primary's slot mask (same grapheme count, same
  // punctuation slots) keep the masked input; only an incompatible alternative
  // forces the free-text fallback.
  const useFreeAnswerInput = requiresExplicitTypingCheck(answerCandidates);
  const manualCheck = checkButtonEnabled;
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
  useLayoutEffect(() => {
    if (autoFocusedWordIdRef.current === word.id) return;
    autoFocusedWordIdRef.current = word.id;
    // focus() raises onFocus, which flips isFocused. This is keyed by word id
    // so toggling the preference in settings does not open the mobile keyboard
    // for the already-visible card.
    const shouldAutoFocus = isMobileLayout()
      ? (autoFocusOnMobile ?? autoFocus)
      : autoFocus;
    if (shouldAutoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, autoFocusOnMobile, word.id]);

  useEffect(() => {
    if (!isFocused || result !== null || !isMobileLayout() || !isIOSBrowser()) return;
    const article = articleRef.current;
    const input = inputRef.current;
    const scrollContainer = article?.closest<HTMLElement>('.learning-card-main');
    if (!article || !input || !scrollContainer) return;

    const viewport = window.visualViewport;
    const owner = `${word.id}-${Date.now()}`;
    scrollContainer.dataset.typingKeyboardOwner = owner;
    let settleTimerId = 0;

    const alignTypingRegion = () => {
      const layoutHeight = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
      );
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const keyboardInset = Math.max(0, layoutHeight - viewportBottom);

      // Shrink this scroll surface by exactly the keyboard overlap. The card
      // can then reflow naturally instead of being translated as a whole. The
      // extra reserve accounts for the iOS accessory bar above the keys.
      scrollContainer.style.paddingBottom = `${Math.ceil(
        keyboardInset + MOBILE_KEYBOARD_ACCESSORY_RESERVE_PX,
      )}px`;
      scrollContainer.style.scrollPaddingBottom = `${Math.ceil(
        keyboardInset + MOBILE_KEYBOARD_ACCESSORY_RESERVE_PX,
      )}px`;

      // Apply the final layout and scroll before the browser paints. A smooth
      // scroll here creates a second visible movement after the keyboard.
      input.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    };

    const scheduleAlignment = (delay = 120) => {
      window.clearTimeout(settleTimerId);
      settleTimerId = window.setTimeout(alignTypingRegion, delay);
    };

    const scheduleAfterResize = () => scheduleAlignment(120);
    scheduleAlignment(450);
    window.addEventListener('resize', scheduleAfterResize);
    viewport?.addEventListener('resize', scheduleAfterResize);

    return () => {
      window.clearTimeout(settleTimerId);
      window.removeEventListener('resize', scheduleAfterResize);
      viewport?.removeEventListener('resize', scheduleAfterResize);
      if (scrollContainer.dataset.typingKeyboardOwner !== owner) return;
      delete scrollContainer.dataset.typingKeyboardOwner;
      scrollContainer.style.removeProperty('padding-bottom');
      scrollContainer.style.removeProperty('scroll-padding-bottom');
      scrollContainer.scrollTop = 0;
    };
  }, [isFocused, result, word.id]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Move focus to the continue control so Enter/Space advances.
  useEffect(() => {
    if (!result) return;
    compactContinueRef.current?.focus();
  }, [result]);

  const playClip = (audioSrc: string | string[] | null) =>
    playUserInitiatedAudio(audioRef, audioSrc);

  const replayPrompt = () => {
    void playClip(promptAudioSrcs);
  };

  const refocusTypingInput = () => {
    inputRef.current?.focus({ preventScroll: true });
  };

  const startAudioWithoutDroppingTypingFocus = (
    event: Pick<Event, 'preventDefault' | 'timeStamp'>,
  ) => {
    if (
      !isMobileLayout()
      || result !== null
      || (!isFocused && document.activeElement !== inputRef.current)
    ) return;

    event.preventDefault();
    audioTouchActiveRef.current = true;
    refocusTypingInput();
    // iOS may emit touchstart followed by pointerdown for the same tap.
    if (event.timeStamp - audioPressStartedAtRef.current < 250) return;
    audioPressStartedAtRef.current = event.timeStamp;
    replayPrompt();
  };

  const handleAudioClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // A mobile touch already played synchronously in touchstart/pointerdown.
    if (event.timeStamp - audioPressStartedAtRef.current < 1000) {
      event.preventDefault();
      refocusTypingInput();
      audioTouchActiveRef.current = false;
      return;
    }
    replayPrompt();
  };

  const handleTypingBlur = () => {
    if (audioTouchActiveRef.current && isMobileLayout() && result === null) {
      refocusTypingInput();
      return;
    }
    setIsFocused(false);
  };

  useEffect(() => {
    const button = audioButtonRef.current;
    if (!button) return;
    const handleTouchStart = (event: TouchEvent) => {
      if (
        !isMobileLayout()
        || result !== null
        || (!isFocused && document.activeElement !== inputRef.current)
      ) return;
      event.preventDefault();
      audioTouchActiveRef.current = true;
      refocusTypingInput();
      if (event.timeStamp - audioPressStartedAtRef.current < 250) return;
      audioPressStartedAtRef.current = event.timeStamp;
      void playUserInitiatedAudio(
        audioRef,
        getWordAudioSrcsBySide(word, foreignSide),
      );
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!audioTouchActiveRef.current) return;
      event.preventDefault();
      refocusTypingInput();
      audioTouchActiveRef.current = false;
    };
    const handleTouchCancel = () => {
      if (!audioTouchActiveRef.current) return;
      refocusTypingInput();
      audioTouchActiveRef.current = false;
    };
    button.addEventListener('touchstart', handleTouchStart, { passive: false });
    button.addEventListener('touchend', handleTouchEnd, { passive: false });
    button.addEventListener('touchcancel', handleTouchCancel);
    return () => {
      button.removeEventListener('touchstart', handleTouchStart);
      button.removeEventListener('touchend', handleTouchEnd);
      button.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [foreignSide, isFocused, result, word]);

  const typedChars = splitGraphemes(value);
  const minimumAnswerLengthForCheck = getMinimumTypingAnswerLength(
    answerCandidates,
    useFreeAnswerInput,
    editableCount,
  );
  const isManualAnswerComplete =
    minimumAnswerLengthForCheck > 0 && typedChars.length >= minimumAnswerLengthForCheck;

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
    const nextResult = evaluateTypingAnswer(merged, answerCandidates, hintsRef.current);
    // A checked card no longer needs the keyboard. Blur synchronously so mobile
    // browsers start closing it before the result layout is painted.
    inputRef.current?.blur();
    setResult(nextResult);
    if (playAudioAfterCheck) void playClip(promptAudioSrcs);
    // Score lands the moment the answer is checked; only the SR stage waits
    // for the continue tap.
    if (nextResult.points > 0) onScore?.(nextResult.points);
  };

  // Auto path: fires when enough editable text is present. The check button
  // preference is the single switch that opts into explicit confirmation.
  const finishCheck = (nextValue: string) => {
    if (manualCheck) return;
    if (splitGraphemes(nextValue).length < minimumAnswerLengthForCheck) return;
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

    const requestedEditableIndex = Number(closest?.dataset.editableIndex);
    if (!Number.isInteger(requestedEditableIndex)) {
      updateCaret(target);
      return;
    }
    const valueChars = splitGraphemes(target.value);
    const editableIndex = Math.min(requestedEditableIndex, valueChars.length);
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

  const preserveTypingFocus = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobileLayout() || document.activeElement !== inputRef.current) return;
    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
  };

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

  return (
    <article
      ref={articleRef}
      className={`phrase-card relative ${fullscreen ? 'word-card--fullscreen' : ''}`}
      style={GAME_PALETTE}
      data-word-id={word.id}
      data-stage-group={stageGroup}
    >
      <div className={`word-card-content flex flex-col gap-2 md:[@media(max-height:800px)]:gap-1 ${fullscreen ? 'md:translate-y-4 md:[@media(max-height:800px)]:!translate-y-0' : ''}`}>
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
              ref={audioButtonRef}
              type="button"
              className="!h-16 !min-h-16 !w-16 !min-w-16 flex items-center justify-center !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!bg-[#1E6FA8] hover:!border-[#1E6FA8] hover:!text-[#F4EFE2] active:!bg-[#1E6FA8] active:!border-[#1E6FA8] active:!text-[#F4EFE2] cursor-pointer"
              onClick={handleAudioClick}
              onPointerDown={startAudioWithoutDroppingTypingFocus}
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
        <TypingAnswerInput
          inputRef={inputRef}
          isComposingRef={isComposingRef}
          useFreeAnswerInput={useFreeAnswerInput}
          result={result}
          value={value}
          manualCheck={manualCheck}
          isFocused={isFocused}
          mask={maskGroups}
          isManualAnswerComplete={isManualAnswerComplete}
          hintExhausted={hintExhausted}
          onApplyValue={applyInputValue}
          onSubmit={submitCheck}
          onFocus={() => setIsFocused(true)}
          onBlur={handleTypingBlur}
          onUpdateCaret={updateCaret}
          onSelectSlot={selectSlotFromPointer}
          onReveal={revealNextLetter}
          onPreserveFocus={preserveTypingFocus}
        />

        {showMemoryHook && (
          <TypingMemoryHook
            memoryHook={memoryHook}
            suggestedHook={suggestedHook}
            onChange={onMemoryHookChange}
          />
        )}
      </div>

      <div className="card-actions relative mt-6 md:[@media(max-height:800px)]:!mt-2">
        {showTypingAudio && (
          <button
            ref={audioButtonRef}
            type="button"
            className="audio-btn audio-btn--floating !h-16 !min-h-16 !w-16 !min-w-16 !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!border-[#1E6FA8] hover:!bg-[#1E6FA8] hover:!text-[#F4EFE2] active:!border-[#1E6FA8] active:!bg-[#1E6FA8] active:!text-[#F4EFE2] max-md:!top-[-90px] md:[@media(max-height:800px)]:!top-[-82px]"
            onClick={handleAudioClick}
            onPointerDown={startAudioWithoutDroppingTypingFocus}
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
              className="typing-continue-enter srs-btn srs-btn--okay mx-auto !hidden w-full !max-w-md items-center justify-center rounded-xl border-2 !border-[#1E6FA8] !bg-[#1E6FA8] px-3 !text-[#F4EFE2] shadow-none hover:!border-[#17608f] hover:!bg-[#17608f] hover:!text-[#F4EFE2] focus-visible:!border-[#17608f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E6FA8] md:absolute md:right-0 md:top-0 md:mx-0 md:!flex md:!h-[72px] md:!min-h-[72px] md:!w-64 md:!max-w-64 md:[@media(max-height:800px)]:!h-14 md:[@media(max-height:800px)]:!min-h-14"
              onClick={handleContinue}
            >
              <span className="srs-btn-copy">
                <span className="srs-btn-label">{t('card.continue')} →</span>
                <span className="srs-btn-hint !opacity-[0.55] !whitespace-normal max-sm:!text-[0.55rem] max-sm:!leading-[1.1] max-sm:!tracking-[0.04em]">{continueHint}</span>
              </span>
            </button>
          )}
          <div
            data-typing-secondary-actions
            className={`mx-auto w-full !max-w-md max-md:!h-11 max-md:!w-32 max-md:!max-w-32 max-md:transition-transform max-md:duration-300 max-md:ease-out max-md:[&_.srs-btn]:!h-11 max-md:[&_.srs-btn]:!min-h-11 max-md:[&_.srs-btn]:!px-2 max-md:[&_.srs-btn]:!py-1 md:absolute md:left-0 md:top-0 md:mx-0 md:!h-[72px] md:!w-64 md:!max-w-64 md:transition-transform md:duration-500 md:ease-[cubic-bezier(0.22,1,0.36,1)] md:[&_.srs-btn]:!h-[72px] md:[&_.srs-btn]:!min-h-[72px] md:[@media(max-height:800px)]:!h-14 md:[@media(max-height:800px)]:[&_.srs-btn]:!h-14 md:[@media(max-height:800px)]:[&_.srs-btn]:!min-h-14 ${result ? 'md:translate-x-0' : 'max-md:-translate-y-1 md:translate-x-[136px]'} ${isFocused && result === null ? 'max-md:invisible max-md:pointer-events-none' : ''}`}
          >
            <CustomStagePopover
              clampedStageIndex={clampedStageIndex}
              onCustomStage={handleCustomStage}
            />
          </div>
          {result && (
            <div
              data-mobile-result-actions-spacer
              aria-hidden="true"
              className="h-[calc(60px+env(safe-area-inset-bottom,0px))] shrink-0 md:hidden"
            />
          )}
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
          className="typing-mobile-continue-enter absolute inset-x-0 bottom-0 z-10 flex min-h-[60px] w-full items-center justify-center border-0 border-t-2 border-[#1E6FA8] bg-[#1E6FA8] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-[#F4EFE2] shadow-[0_-6px_18px_rgba(0,0,0,0.18)] md:hidden"
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
