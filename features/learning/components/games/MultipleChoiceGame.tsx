'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
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
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { shuffleGameItems } from '@/features/learning/minigames';
import { SuccessMarkSlot } from './SuccessMark';

type ChoiceLayout = 'split' | 'cards' | 'compact';

function getChoiceLayout(optionCount: number): ChoiceLayout {
  if (optionCount <= 3) return 'split';
  if (optionCount <= 6) return 'cards';
  return 'compact';
}

function getChoiceGridClasses(optionCount: number, layout: ChoiceLayout): string {
  if (layout === 'split') {
    return optionCount === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
  }
  if (layout === 'cards') {
    if (optionCount === 4) return 'grid-cols-2';
    if (optionCount === 5) return 'grid-cols-2 sm:grid-cols-6';
    return 'grid-cols-2 sm:grid-cols-3';
  }
  return 'grid-cols-2 sm:grid-cols-4';
}

// The option IS the word being studied, so it carries the type size a study
// card would give it. Fewer options on screen means each one can be bigger.
const optionSizeClasses: Record<ChoiceLayout, string> = {
  split: '!min-h-20 sm:!min-h-24 !px-4 !py-4 !text-xl sm:!text-2xl',
  cards: '!min-h-16 !px-3 !py-3 !text-lg sm:!text-xl',
  compact: '!min-h-14 !px-2.5 !py-2.5 !text-base sm:!text-lg',
};

interface Props {
  /** Correct word first, distractors after. Length sets the option count (2–8). */
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  level?: 1 | 2;
  onResult?: (delta: number) => void;
  /**
   * Fired once with the review outcome when the game stands in for a study
   * card. Separate from onResult, which is only ever about the score.
   */
  onOutcome?: (outcome: 'known' | 'unknown') => void;
  /** Drop the outer card frame so the round reads as part of the study flow. */
  frameless?: boolean;
}

export function MultipleChoiceGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  soundEnabled = false,
  level = 1,
  onResult,
  onOutcome,
  frameless = false,
}: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [optionOrder] = useState(() => shuffleGameItems(words.map((word) => word.id)));
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const questionWord = words[0];
  const promptSide: WordSide = sourceLang ?? knownSideForRole(role);
  const learningSide: WordSide = learningSideForRole(role);
  const answerSide: WordSide = flipSide(promptSide);
  const prompt = getWordTextBySide(questionWord, promptSide);
  const correctAnswer = getWordTextBySide(questionWord, answerSide);
  const promptAudioSrc = getWordAudioSrcBySide(questionWord, promptSide);
  const effectivePromptMode: PromptMode = promptMode === 'audio' && promptAudioSrc ? 'audio' : 'text';

  const options = useMemo(
    () => optionOrder
      .map((id) => words.find((word) => word.id === id))
      .filter((word): word is NormalizedWord => Boolean(word))
      .map((w) => ({
      id: w.id,
      label: getWordTextBySide(w, answerSide),
      answerAudioSrcs: getWordAudioSrcsBySide(w, learningSide),
      isCorrect: w.id === questionWord.id,
    })),
    [answerSide, learningSide, optionOrder, questionWord.id, words]
  );

  const answered = selected !== null;
  const selectedOption = options.find((option) => option.id === selected);
  const choiceLayout = getChoiceLayout(options.length);
  const choiceGridClasses = getChoiceGridClasses(options.length, choiceLayout);

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
    onOutcome?.(isCorrect ? 'known' : 'unknown');
  };

  const playAudio = (audioSrc: string | string[] | null) => {
    void playUserInitiatedAudio(audioRef, audioSrc);
  };

  const replayPrompt = () => {
    playAudio(promptAudioSrc);
  };

  return (
    <article
      className={`phrase-card game-card game-card--choice${frameless ? ' game-card--bare' : ''}`}
    >
      <SuccessMarkSlot
        show={answered && Boolean(selectedOption?.isCorrect)}
        label={t('game.correct')}
        rollKey={questionWord.id}
      />
      {/* As a study card the round needs no label: the reveal and typing cards
          it alternates with carry none either, and a lone pill floating above a
          frameless layout reads as a leftover. */}
      {!frameless && (
        <div className="game-badge">
          {effectivePromptMode === 'audio'
            ? `🎯 ${t('game.choose')}`
            : `🎯 ${t('game.choice')}`}
        </div>
      )}
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
      <div
        className={`mx-auto grid w-full gap-3 sm:gap-4 ${choiceGridClasses} ${choiceLayout === 'compact' ? 'max-w-4xl' : 'max-w-3xl'}`}
        data-option-count={options.length}
        data-choice-layout={choiceLayout}
      >
        {options.map((opt, index) => {
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
              data-choice-index={index}
              {...noTranslateProps([
                `game-option game-option--${state}`,
                'group relative flex items-center justify-center overflow-hidden !rounded-2xl !border-[1.5px] !font-bold !leading-snug',
                'transition-[transform,background-color,border-color,box-shadow,color] duration-200 disabled:!cursor-default disabled:!opacity-100',
                optionSizeClasses[choiceLayout],
                choiceLayout === 'cards' && options.length === 5
                  ? index < 3 ? 'sm:col-span-2' : 'sm:col-span-3'
                  : '',
                state === 'idle'
                  ? '!border-[#BBAE98] !bg-[#FFF8E8] !text-[#2A2218] shadow-[0_3px_0_#D8C9AF] hover:!-translate-y-0.5 hover:!border-[#1E6FA8] hover:!shadow-[0_5px_0_#C7B89E] active:!translate-y-[2px] active:!shadow-none motion-safe:animate-deck-enter-rise'
                  : '',
                state === 'correct'
                  ? '!scale-[1.025] !border-[#187A43] !bg-[#E3F3E7] !text-[#145B33] shadow-[0_4px_0_#A9D3B6] motion-safe:animate-[pulse_420ms_ease-out_1]'
                  : '',
                state === 'wrong'
                  ? '!border-[#B91C1C] !bg-[#FCE7E5] !text-[#8F1515] shadow-[0_3px_0_#E4AAA6]'
                  : '',
                state === 'reveal'
                  ? '!border-[#187A43] !bg-[#F1F7ED] !text-[#187A43] !shadow-none'
                  : '',
              ].filter(Boolean).join(' '))}
              style={!answered ? { animationDelay: `${index * 55}ms` } : undefined}
              onClick={() => handleSelect(opt.id)}
              disabled={answered}
            >
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      {answered && !selectedOption?.isCorrect ? (
        <div className="game-feedback">
          {/* The two branches are separate elements so the wrong-answer one can
              carry the study-text opt-out on a single text node, rather than
              splitting the line around an inner span. */}
          <span {...noTranslateProps('game-feedback--wrong')}>{`✗  ${correctAnswer}`}</span>
        </div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
