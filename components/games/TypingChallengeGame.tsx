'use client';

import React, { useState, useRef, useEffect } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import type { NormalizedWord } from '@/lib/words';
import { matchAnswer } from '@/lib/minigames';
import {
  flipSide,
  getWordAudioSrcsBySide,
  getWordLanguageCodeForSide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './types';
import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';

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
  const promptAudioSrcs = getWordAudioSrcsBySide(questionWord, promptSide);
  const learningAudioSrcs = getWordAudioSrcsBySide(questionWord, learningSide);
  const [hasAudioPlaybackError, setHasAudioPlaybackError] = useState(false);
  const effectivePromptMode: PromptMode =
    promptMode === 'audio' &&
    promptAudioSrcs.length > 0 &&
    !hasAudioPlaybackError
      ? 'audio'
      : 'text';
  const normalizedAnswer = correctAnswer.trim();
  const answerChars = normalizedAnswer.split('');
  const hintExhausted = answerChars.every((ch, idx) => (value[idx] ?? '') === ch);
  const answerLanguageCode = getWordLanguageCodeForSide(questionWord, answerSide);
  const targetLanguageLabel = (() => {
    if (answerLanguageCode) {
      const key = `languageNameIn.${answerLanguageCode}` as I18nKey;
      const translated = t(key);
      if (translated && translated !== key) return translated;
    }
    // BCP-47-driven lookup; falls back to the legacy cz/vi labels for words
    // that pre-date the languageFrom/languageTo metadata.
    if (answerLanguageCode) {
      // Dynamic BCP-47 code; the key may or may not exist in the message
      // catalog. t() returns the key itself when missing, which we treat as
      // "fall back to Intl.DisplayNames below".
      const key = `languageName.${answerLanguageCode}` as I18nKey;
      const translated = t(key);
      if (translated && translated !== key) return translated;

      const localizedName = getLocalizedLanguageName(answerLanguageCode, language);
      if (localizedName) return localizedName;

      return answerLanguageCode.toUpperCase();
    }
    // Only words without language metadata can be legacy Czech/Vietnamese
    // records. Never use these labels for a known, different language pair.
    return answerSide === 'from' ? t('languageNameIn.cs') : t('languageNameIn.vi');
  })();

  const check = () => {
    if (result !== null || !value.trim()) return;
    const r = matchAnswer(value, correctAnswer);
    setResult(r);
    const delta = r === 'exact' ? 2 : r === 'close' ? 1 : 0;
    if (delta > 0 && soundEnabled) {
      void playClip(learningAudioSrcs);
    }
    onResult?.(delta);
  };

  // Each press fills the next still-missing letter of the answer (skipping over
  // and auto-filling any spaces), so repeated presses progressively reveal it.
  const revealNextLetter = () => {
    if (result !== null) return;
    const next = value.split('');
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
        const pos = Math.min(caretPos, nextValue.length);
        input.setSelectionRange(pos, pos);
        updateCaret(input);
      }
    });
  };

  useEffect(() => {
    inputRef.current?.focus();
    setIsFocused(true);
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
    const next = target.selectionStart ?? value.length;
    setCaretIndex(next);
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
        <div className="game-prompt">{prompt}</div>
      )}
      <div className="game-typing-area">
        <div
          className={[
            'game-typing-input-wrap',
            result ? `game-typing-input-wrap--${result}` : '',
            isFocused ? 'is-focused' : '',
          ].filter(Boolean).join(' ')}
        >
          <div className="game-typing-mask" aria-hidden="true">
            {answerChars.map((ch, idx) => {
              const typedChar = value[idx] ?? '';
              const isSpace = ch === ' ';
              const isActive = idx === caretIndex;
              return (
                <span
                  key={`ch-${idx}`}
                  className={[
                    'game-typing-slot',
                    isSpace ? 'game-typing-slot--space' : '',
                    isActive ? 'is-active' : '',
                  ].join(' ')}
                >
                  {typedChar ? typedChar : '_'}
                </span>
              );
            })}
          </div>
          <input
            ref={inputRef}
            type="text"
            className={`game-input game-input--masked${result ? ` game-input--${result}` : ''}`}
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
