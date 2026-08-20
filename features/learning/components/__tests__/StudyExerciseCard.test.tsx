import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudyExerciseCard } from '../StudyExerciseCard';
import type { ProgressData } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';
import type { ResolvedExercise } from '@/features/learning/fine-tune/types';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

// role=knownLanguage: known side = cz ('from'), foreign/learning side = vi ('to').
const WORD = makeWord('a', 'pes', 'con chó');
const DISTRACTORS = [
  makeWord('b', 'kočka', 'con mèo'),
  makeWord('c', 'ryba', 'con cá'),
  makeWord('d', 'pták', 'con chim'),
];
const PROGRESS: ProgressData = { stageIndex: 3, knownCount: 2, unknownCount: 0 };

function renderCard(exercise: ResolvedExercise, overrides?: { onOutcome?: () => void }) {
  const onOutcome = vi.fn();
  const onScore = vi.fn();
  render(
    <StudyExerciseCard
      word={WORD}
      progress={PROGRESS}
      role="knownLanguage"
      exercise={exercise}
      showAll={false}
      memoryHook=""
      suggestedHook=""
      onMemoryHookChange={vi.fn()}
      showMemoryHook={false}
      onKnown={vi.fn()}
      onReallyKnown={vi.fn()}
      onUnknown={vi.fn()}
      onCustomStage={vi.fn()}
      onScore={onScore}
      onOutcome={overrides?.onOutcome ?? onOutcome}
      showEnglish={false}
      showCategoryBadges={false}
      showPronunciation={false}
      categoryOrder={[]}
      studyNotesEnabled={false}
      studyNoteMinimizeFromStage={2}
      typingPrefillPunctuation
      typingPlayAudioAfterCheck={false}
      typingCheckButtonEnabled={false}
    />,
  );
  return { onOutcome, onScore };
}

const choiceExercise = (band: 'I' | 'II' | 'III'): ResolvedExercise => ({
  method: 'choice',
  variant: `4:${band}`,
  requestedBand: band,
  effectiveBand: band,
  distractors: DISTRACTORS,
});

describe('StudyExerciseCard — choice', () => {
  it('renders the round without the outer game frame', () => {
    renderCard(choiceExercise('I'));
    const card = document.querySelector('article');
    // Choice is part of the study flow, not a visitor inside it.
    expect(card?.className).toContain('game-card--bare');
  });

  it('drops the quiz badge, matching the cards it alternates with', () => {
    renderCard(choiceExercise('I'));
    expect(document.querySelector('.game-badge')).toBeNull();
  });

  it('offers exactly as many options as the variant asks for', () => {
    renderCard(choiceExercise('I'));
    expect(document.querySelectorAll('.game-option')).toHaveLength(4);
    expect(document.querySelector('.game-options-grid')).toHaveAttribute('data-option-count', '4');
  });

  it('reports a right first answer as a completed review', () => {
    // Bands I and II ask the easy way round: the foreign word is the prompt and
    // the options are in the learner's own language.
    const { onOutcome, onScore } = renderCard(choiceExercise('I'));
    fireEvent.click(screen.getByText('pes'));
    expect(onScore).toHaveBeenCalled();
    // The stage only moves once the learner has seen the result and moved on.
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('reports a wrong answer so the word steps back', () => {
    const { onOutcome } = renderCard(choiceExercise('I'));
    fireEvent.click(screen.getByText('kočka'));
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    expect(onOutcome).toHaveBeenCalledWith('unknown');
  });

  it('asks in the harder direction once the distractors are near twins', () => {
    // Band III is about telling near-identical foreign spellings apart, which
    // only works when the options are the foreign side.
    renderCard(choiceExercise('III'));
    const options = Array.from(document.querySelectorAll('.game-option')).map(
      (option) => option.textContent,
    );
    expect(options).toContain('con chó');
    expect(options).toContain('con mèo');
    expect(options).not.toContain('pes');
  });
});

describe('StudyExerciseCard — reveal', () => {
  it('covers the foreign side when the variant says the known word is shown', () => {
    renderCard({ method: 'reveal', variant: 'known' });
    expect(document.querySelector('article')?.className).toContain('phrase-card');
    expect(screen.getByText('pes')).toBeInTheDocument();
  });
});

describe('StudyExerciseCard — typing', () => {
  it('renders the typing card for a typing exercise', () => {
    renderCard({ method: 'typing', variant: '0:0' });
    expect(document.querySelector('article input')).toBeInTheDocument();
    // The hardest rung offers no way out.
    expect(document.querySelector('.game-hint-btn')).toBeNull();
  });

  it('keeps the hint button on the scaffolded rungs', () => {
    renderCard({ method: 'typing', variant: '0:20' });
    expect(document.querySelector('.game-hint-btn')).not.toBeNull();
  });
});

describe('StudyExerciseCard — assembly', () => {
  it('moves SR only after the assembled phrase is checked', () => {
    const { onOutcome } = renderCard({
      method: 'assembly',
      variant: 'words:exact',
      answerParts: ['con', 'chó'],
      distractorParts: [],
    });

    fireEvent.click(screen.getByText('con'));
    fireEvent.click(screen.getByText('chó'));
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    expect(onOutcome).toHaveBeenCalledWith('known');
  });
});
