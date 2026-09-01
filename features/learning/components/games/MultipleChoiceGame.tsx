'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
import { StudyOptionButton, type StudyOptionSize } from './StudyOptionButton';
import { StageBadge } from '../StageBadge';
import { CardTopControls } from '../CardTopControls';
import { useCardAudio } from '../card-audio/useCardAudio';
import type { SimilarityBand } from '@/features/learning/minigames/similarity';

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
const optionSizeForLayout: Record<ChoiceLayout, StudyOptionSize> = {
  split: 'lg',
  cards: 'md',
  compact: 'sm',
};

interface Props {
  /** Correct word first, distractors after. Length sets the option count (2–8). */
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  /** Card-level controls (the sound toggle) that share the card's top lane. */
  topControls?: ReactNode;
  level?: 1 | 2;
  difficultyBand?: SimilarityBand;
  /** The prompt word's current spaced-repetition stage. */
  stageIndex?: number;
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
  topControls,
  difficultyBand,
  stageIndex = 0,
  onResult,
  onOutcome,
  frameless = false,
}: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [optionOrder] = useState(() => shuffleGameItems(words.map((word) => word.id)));
  const { play, playAuto } = useCardAudio();

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

  const handleSelect = (optionId: string) => {
    if (answered) return;
    const selectedOption = options.find(o => o.id === optionId);
    const isCorrect = selectedOption?.isCorrect ?? false;
    if (isCorrect && soundEnabled) {
      void playAuto(selectedOption?.answerAudioSrcs ?? []);
    }
    setSelected(optionId);
    // One point for a right answer; a wrong one costs nothing. The score
    // counts what the learner got, so it never walks backwards.
    onResult?.(isCorrect ? 1 : 0);
    onOutcome?.(isCorrect ? 'known' : 'unknown');
  };

  const replayPrompt = () => {
    void play(promptAudioSrc);
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
      <CardTopControls>
        <StageBadge stageIndex={stageIndex} difficultyBand={difficultyBand} />
        {topControls}
      </CardTopControls>
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
        <div className="flex flex-col items-center gap-2">
          <div {...noTranslateProps('game-prompt !p-0 !text-4xl !font-extrabold !leading-none sm:!text-5xl')}>
            {prompt}
          </div>
        </div>
      )}
      {/* The prompt needs room to read as the question rather than as the first
          option: a plain flex gap put it close enough to the grid that the eye
          ran straight past it. */}
      <div
        className={`mx-auto mt-4 grid w-full gap-3 sm:mt-8 sm:gap-4 ${choiceGridClasses} ${choiceLayout === 'compact' ? 'max-w-4xl' : 'max-w-3xl'}`}
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
            <StudyOptionButton
              key={opt.id}
              state={state}
              size={optionSizeForLayout[choiceLayout]}
              data-choice-index={index}
              className={
                choiceLayout === 'cards' && options.length === 5
                  ? index < 3 ? 'sm:col-span-2' : 'sm:col-span-3'
                  : ''
              }
              onClick={() => handleSelect(opt.id)}
              disabled={answered}
            >
              {opt.label}
            </StudyOptionButton>
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
