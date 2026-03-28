'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedWord } from '@/lib/words';
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

export function MultipleChoiceGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  onResult,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const questionWord = words[0];
  const resolvedSourceLang = sourceLang ?? resolveSourceLangFromRole(role);
  const targetLang = getTargetLang(resolvedSourceLang);
  const getOption = (w: NormalizedWord) => getWordTextByLang(w, targetLang);
  const prompt = getWordTextByLang(questionWord, resolvedSourceLang);
  const correctAnswer = getOption(questionWord);
  const promptAudioSrc = getWordAudioSrcByLang(questionWord, resolvedSourceLang);
  const effectivePromptMode: PromptMode = promptMode === 'audio' && promptAudioSrc ? 'audio' : 'text';

  const options = useMemo(
    () => [...words].sort(() => Math.random() - 0.5).map(w => ({
      id: w.id,
      label: getOption(w),
      isCorrect: w.id === questionWord.id,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, role]
  );

  const answered = selected !== null;

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSelect = (optionId: string) => {
    if (answered) return;
    setSelected(optionId);
    const isCorrect = options.find(o => o.id === optionId)?.isCorrect ?? false;
    onResult?.(isCorrect ? 1 : -1);
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

  return (
    <article className="phrase-card game-card game-card--choice">
      <div className="game-badge">
        {effectivePromptMode === 'audio'
          ? `🎯 Choose in ${targetLang === 'cz' ? 'Czech' : 'Vietnamese'}`
          : '🎯 Choice'}
      </div>
      {effectivePromptMode === 'audio' ? (
        <div className="game-audio-prompt">
          <button
            type="button"
            className="game-audio-btn"
            onClick={replayPrompt}
            aria-label="Replay prompt audio"
          >
            🔊
          </button>
        </div>
      ) : (
        <div className="game-prompt">{prompt}</div>
      )}
      <div className="game-options-grid">
        {options.map(opt => {
          let state: 'idle' | 'correct' | 'wrong' | 'reveal' = 'idle';
          if (answered) {
            if (opt.id === selected && opt.isCorrect) state = 'correct';
            else if (opt.id === selected && !opt.isCorrect) state = 'wrong';
            else if (opt.isCorrect) state = 'reveal';
          }
          return (
            <button
              key={opt.id}
              type="button"
              className={`game-option game-option--${state}`}
              onClick={() => handleSelect(opt.id)}
              disabled={answered}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className="game-feedback">
          <span className={options.find(o => o.id === selected)?.isCorrect ? 'game-feedback--exact' : 'game-feedback--wrong'}>
            {options.find(o => o.id === selected)?.isCorrect ? '✓ Correct!' : `✗  ${correctAnswer}`}
          </span>
        </div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
