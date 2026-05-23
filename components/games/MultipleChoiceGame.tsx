'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getPlayableAudioUrl } from '@/lib/audio-availability';
import type { NormalizedWord } from '@/lib/words';
import {
  flipSide,
  getWordAudioSrcBySide,
  getWordAudioSrcsBySide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './types';
import { useI18n } from '@/components/I18nProvider';

interface Props {
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  level?: 1 | 2;
  onResult?: (delta: number) => void;
}

export function MultipleChoiceGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  soundEnabled = false,
  level = 1,
  onResult,
}: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const questionWord = words[0];
  const promptSide: WordSide = sourceLang ?? knownSideForRole(role);
  const learningSide: WordSide = learningSideForRole(role);
  const answerSide: WordSide = flipSide(promptSide);
  const getOption = (w: NormalizedWord) => getWordTextBySide(w, answerSide);
  const prompt = getWordTextBySide(questionWord, promptSide);
  const correctAnswer = getOption(questionWord);
  const promptAudioSrc = getWordAudioSrcBySide(questionWord, promptSide);
  const effectivePromptMode: PromptMode = promptMode === 'audio' && promptAudioSrc ? 'audio' : 'text';

  const options = useMemo(
    () => [...words].sort(() => Math.random() - 0.5).map(w => ({
      id: w.id,
      label: getOption(w),
      answerAudioSrcs: getWordAudioSrcsBySide(w, learningSide),
      isCorrect: w.id === questionWord.id,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, answerSide, learningSide, questionWord.id]
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
    const selectedOption = options.find(o => o.id === optionId);
    const isCorrect = selectedOption?.isCorrect ?? false;
    if (isCorrect && soundEnabled) {
      playAudio(selectedOption?.answerAudioSrcs ?? []);
    }
    setSelected(optionId);
    onResult?.(isCorrect ? (level === 2 ? 2 : 1) : -1);
  };

  const playAudio = (audioSrc: string | string[] | null) => {
    void (async () => {
      const candidates = (Array.isArray(audioSrc) ? audioSrc : [audioSrc])
        .filter((src): src is string => Boolean(src))
        .filter((src, index, arr) => arr.indexOf(src) === index);

      for (const candidate of candidates) {
        const playableUrl = await getPlayableAudioUrl(candidate);
        if (!playableUrl) continue;

        try {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          const audio = new Audio(playableUrl);
          audioRef.current = audio;
          await audio.play();
          return;
        } catch {
          // Try the next candidate when this source cannot be played.
        }
      }
    })();
  };

  const replayPrompt = () => {
    playAudio(promptAudioSrc);
  };

  return (
    <article className="phrase-card game-card game-card--choice">
      <div className="game-badge">
        {effectivePromptMode === 'audio'
          ? `🎯 ${t('game.choose')}`
          : `🎯 ${t('game.choice')}`}
      </div>
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
            {options.find(o => o.id === selected)?.isCorrect ? `✓ ${t('game.correct')}` : `✗  ${correctAnswer}`}
          </span>
        </div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
