'use client';

import React, { useState, useRef, useEffect } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import type { NormalizedWord } from '@/lib/words';
import {
  getAcceptedAnswerCandidates,
  matchAnswerAgainstCandidates,
  requiresExplicitTypingCheck,
} from '@/features/learning/minigames';
import { splitGraphemes } from '@/lib/answer-normalization';
import {
  flipSide,
  getWordAcceptedAnswersBySide,
  getWordAudioSrcsBySide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './types';
import { getTypingTargetLanguageLabel } from './target-language-label';
import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';

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

interface Props {
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  onResult?: (delta: number) => void;
}

export function TypingChallengeGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  soundEnabled = false,
  onResult,
}: Props) {
  const { language, t } = useI18n();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'exact' | 'close' | 'wrong' | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const questionWord = words[0];
  const promptSide: WordSide = sourceLang ?? knownSideForRole(role);
  const learningSide: WordSide = learningSideForRole(role);
  const answerSide: WordSide = flipSide(promptSide);
  const prompt = getWordTextBySide(questionWord, promptSide);
  const correctAnswer = getWordTextBySide(questionWord, answerSide);
  const answerCandidates = getAcceptedAnswerCandidates(
    correctAnswer,
    getWordAcceptedAnswersBySide(questionWord, answerSide),
  );
  // Only an alternative that doesn't fit the primary's slot mask forces the
  // free-text input; slot-compatible alternatives keep the letter-count mask.
  const useFreeAnswerInput = requiresExplicitTypingCheck(answerCandidates);
  const promptAudioSrcs = getWordAudioSrcsBySide(questionWord, promptSide);
  const learningAudioSrcs = getWordAudioSrcsBySide(questionWord, learningSide);
  const [hasAudioPlaybackError, setHasAudioPlaybackError] = useState(false);
  const effectivePromptMode: PromptMode =
    promptMode === 'audio' &&
    promptAudioSrcs.length > 0 &&
    !hasAudioPlaybackError
      ? 'audio'
      : 'text';
  const [matchedAnswer, setMatchedAnswer] = useState(correctAnswer);
  const normalizedAnswer = (result ? matchedAnswer : correctAnswer).trim();
  const answerChars = splitGraphemes(normalizedAnswer);
  const typedChars = splitGraphemes(value);
  const hintExhausted = answerChars.every((ch, idx) => (typedChars[idx] ?? '') === ch);
  const targetLanguageLabel = getTypingTargetLanguageLabel(questionWord, answerSide, t, language);

  const check = () => {
    if (result !== null || !value.trim()) return;
    const r = matchAnswerAgainstCandidates(value, answerCandidates);
    setMatchedAnswer(r.matchedAnswer);
    setResult(r.verdict);
    const delta = r.verdict === 'exact' ? 2 : r.verdict === 'close' ? 1 : 0;
    if (delta > 0 && soundEnabled) {
      void playClip(learningAudioSrcs);
    }
    onResult?.(delta);
  };

  // Each press fills the next still-missing letter of the answer (skipping over
  // and auto-filling any spaces), so repeated presses progressively reveal it.
  const revealNextLetter = () => {
    if (result !== null) return;
    const next = splitGraphemes(value);
    let caretPos = -1;
    for (let idx = 0; idx < answerChars.length; idx++) {
      while (next.length <= idx) next.push('');
      const expected = answerChars[idx];
      if (next[idx] === expected) continue;
      next[idx] = expected;
      // Spaces shouldn't consume a hint press — fill them and keep going.
      if (expected === ' ') continue;
      caretPos = idx + 1;
      break;
    }
    if (caretPos < 0) return;
    const nextValue = next.join('');
    setValue(nextValue);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        // caretPos counts graphemes; setSelectionRange wants UTF-16 units.
        const pos = next.slice(0, caretPos).join('').length;
        input.setSelectionRange(pos, pos);
        updateCaret(input);
      }
    });
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const updateCaret = (target: HTMLInputElement) => {
    const selectionStart = target.selectionStart ?? target.value.length;
    setCaretIndex(splitGraphemes(target.value.slice(0, selectionStart)).length);
  };

  const playClip = async (
    audioSrc: string | string[] | null,
  ): Promise<{ ok: boolean; interrupted: boolean }> => {
    return playUserInitiatedAudio(audioRef, audioSrc);
  };

  const replayPrompt = async () => {
    const result = await playClip(promptAudioSrcs);
    if (result.ok || result.interrupted) return;
    setHasAudioPlaybackError(true);
  };

  const resultLabels: Record<'exact' | 'close' | 'wrong', React.ReactNode> = {
    exact: `✓ ${t('game.perfect')}`,
    close: (
      <>
        ~ {t('game.close')} <strong {...noTranslateProps()}>{matchedAnswer}</strong>
      </>
    ),
    wrong: (
      <>
        ✗ {t('game.correctAnswer')} <strong {...noTranslateProps()}>{matchedAnswer}</strong>
      </>
    ),
  };

  return (
    <article className="phrase-card game-card game-card--typing">
      <div className="game-badge">{`⌨️ ${t('game.typeIn', { language: targetLanguageLabel })}`}</div>
      {effectivePromptMode === 'audio' ? (
        <div className="game-audio-prompt">
          <button
            type="button"
            className="game-audio-btn"
            onClick={replayPrompt}
            aria-label={t('game.replayPromptAudio')}
          >
            🔊
          </button>
        </div>
      ) : (
        <div {...noTranslateProps('game-prompt')}>{prompt}</div>
      )}
      <div className="game-typing-area">
        <div
          className={[
            'game-typing-input-wrap',
            result ? `game-typing-input-wrap--${result}` : '',
            isFocused ? 'is-focused' : '',
          ].filter(Boolean).join(' ')}
        >
          {!useFreeAnswerInput && <div {...noTranslateProps('game-typing-mask')} aria-hidden="true">
            {(() => {
              const groups: React.ReactNode[] = [];
              let word: React.ReactNode[] = [];
              let key = 0;
              const flush = () => {
                if (word.length === 0) return;
                groups.push(
                  <span key={`w-${key++}`} className="game-typing-word">
                    {word}
                  </span>,
                );
                word = [];
              };
              // After a non-perfect check every slot gains a small second
              // row: the expected character under each wrong/close letter
              // (blank elsewhere, kept for equal slot heights).
              const showCorrections = result !== null && result !== 'exact';
              answerChars.forEach((ch, idx) => {
                const typedChar = typedChars[idx] ?? '';
                const isSpace = ch === ' ';
                const isActive = idx === caretIndex;
                const state =
                  result === null || isSpace ? null : slotState(typedChar, ch);
                const needsCorrection =
                  showCorrections && state !== null && state !== 'correct';
                const span = (
                  <span
                    key={`ch-${idx}`}
                    className={[
                      'game-typing-slot',
                      isSpace ? 'game-typing-slot--space' : '',
                      state ? `game-typing-slot--${state}` : '',
                      isActive ? 'is-active' : '',
                      showCorrections ? 'flex-col items-center' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {typedChar ? typedChar : '_'}
                    {showCorrections && (
                      <span
                        className={`game-typing-correction text-[0.58em] font-bold leading-[1.2]${needsCorrection ? '' : ' invisible'}`}
                      >
                        {needsCorrection ? ch : '\u00A0'}
                      </span>
                    )}
                  </span>
                );
                if (isSpace) {
                  flush();
                  groups.push(span);
                } else {
                  word.push(span);
                }
              });
              flush();
              return groups;
            })()}
          </div>}
          <input
            ref={inputRef}
            type="text"
            className={useFreeAnswerInput
              ? `game-input${result ? ` game-input--${result}` : ''}`
              : `game-input game-input--masked${result ? ` game-input--${result}` : ''}`}
            placeholder={t('game.typeTranslation')}
            value={value}
            onChange={e => {
              setValue(e.target.value);
              updateCaret(e.target);
            }}
            onKeyDown={e => { if (e.key === 'Enter') check(); }}
            onClick={e => updateCaret(e.currentTarget)}
            onKeyUp={e => updateCaret(e.currentTarget)}
            onSelect={e => updateCaret(e.currentTarget)}
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
            <button type="button" className="game-check-btn" onClick={check}>
              {t('game.check')}
            </button>
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
      {result !== null ? (
        <div className={`game-feedback game-feedback--${result}`}>
          {resultLabels[result]}
        </div>
      ) : (
        <div aria-hidden="true" />
      )}
    </article>
  );
}
