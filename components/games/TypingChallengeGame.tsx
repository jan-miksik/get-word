'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchAnswer } from '@/lib/minigames';
import {
  getTargetLang,
  getWordAudioSrcByLang,
  getWordTextByLang,
  resolveSourceLangFromRole,
  type PromptMode,
  type SourceLang,
} from './types';

interface Props {
  words: NormalizedWord[];
  role: 'cz' | 'vi';
  sourceLang?: SourceLang;
  promptMode?: PromptMode;
  onResult?: (delta: number) => void;
}

export function TypingChallengeGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  onResult,
}: Props) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'exact' | 'close' | 'wrong' | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const questionWord = words[0];
  const resolvedSourceLang = sourceLang ?? resolveSourceLangFromRole(role);
  const targetLang = getTargetLang(resolvedSourceLang);
  const prompt = getWordTextByLang(questionWord, resolvedSourceLang);
  const correctAnswer = getWordTextByLang(questionWord, targetLang);
  const promptAudioSrc = getWordAudioSrcByLang(questionWord, resolvedSourceLang);
  const effectivePromptMode: PromptMode = promptMode === 'audio' && promptAudioSrc ? 'audio' : 'text';
  const normalizedAnswer = correctAnswer.trim();
  const letterCount = [...normalizedAnswer.replace(/\s+/g, '')].length;
  const firstLetterMatch = normalizedAnswer.match(/\S/);
  const firstLetter = firstLetterMatch ? firstLetterMatch[0] : '';
  const answerChars = normalizedAnswer.split('');

  const check = () => {
    if (result !== null || !value.trim()) return;
    const r = matchAnswer(value, correctAnswer);
    setResult(r);
    const delta = r === 'exact' ? 2 : r === 'close' ? 1 : 0;
    onResult?.(delta);
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

  const replayPrompt = () => {
    if (!promptAudioSrc) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const audio = new Audio(promptAudioSrc);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {
      // no-op: fail silently when audio playback is unavailable
    }
  };

  const resultLabels: Record<'exact' | 'close' | 'wrong', React.ReactNode> = {
    exact: '✓ Perfect!',
    close: (
      <>
        ~ Close! Correct: <strong>{correctAnswer}</strong>
      </>
    ),
    wrong: (
      <>
        ✗ Correct: <strong>{correctAnswer}</strong>
      </>
    ),
  };

  return (
    <article className="phrase-card game-card game-card--typing">
      <div className="game-badge">⌨️ Type it</div>
      {effectivePromptMode === 'audio' ? (
        <div className="game-audio-prompt">
          <button
            type="button"
            className="game-audio-btn"
            onClick={replayPrompt}
            aria-label="Replay prompt audio"
          >
            🔊 Replay prompt
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
            placeholder="Type translation…"
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
              Check
            </button>
            <button
              type="button"
              className="game-hint-btn"
              onClick={() => {
                if (hintUsed) return;
                if (!firstLetter) { setHintUsed(true); return; }
                const idx = answerChars.findIndex((ch) => ch !== ' ');
                if (idx < 0) { setHintUsed(true); return; }
                const next = value.split('');
                while (next.length < idx) next.push('');
                next[idx] = firstLetter;
                const nextValue = next.join('');
                setValue(nextValue);
                setHintUsed(true);
                requestAnimationFrame(() => {
                  const input = inputRef.current;
                  if (input) {
                    const pos = Math.min(idx + 1, nextValue.length);
                    input.setSelectionRange(pos, pos);
                    updateCaret(input);
                  }
                });
              }}
              disabled={hintUsed}
            >
              Hint
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
