import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudyExerciseCard } from '../StudyExerciseCard';
import type { ProgressData } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';
import type {
  ChoiceOptionsSide,
  ResolvedExercise,
} from '@/features/learning/fine-tune/types';

vi.mock('@/lib/audio-availability', () => ({
  getCachedPlayableAudioUrl: () => null,
  getPlayableAudioUrl: (url: string | null) => Promise.resolve(url),
}));

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

const choiceExercise = (
  band: 'I' | 'II' | 'III',
  side: ChoiceOptionsSide = 'foreign',
): ResolvedExercise => ({
  method: 'choice',
  variant: `4:${band}:${side}`,
  requestedBand: band,
  effectiveBand: band,
  optionsSide: side,
  distractors: DISTRACTORS,
});

const optionTexts = () =>
  Array.from(document.querySelectorAll('[data-option-state]')).map((option) => option.textContent);

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
    expect(document.querySelectorAll('[data-option-state]')).toHaveLength(4);
    expect(document.querySelector('[data-choice-layout]')).toHaveAttribute('data-option-count', '4');
  });

  it('reports a right first answer as a completed review', () => {
    const { onOutcome, onScore } = renderCard(choiceExercise('I'));
    fireEvent.click(screen.getByText('con chó'));
    expect(onScore).toHaveBeenCalled();
    // The stage only moves once the learner has seen the result and moved on.
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('reports a wrong answer so the word steps back', () => {
    const { onOutcome } = renderCard(choiceExercise('I'));
    fireEvent.click(screen.getByText('con mèo'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onOutcome).toHaveBeenCalledWith('unknown');
  });

  it('asks in the productive direction: known word shown, foreign options', () => {
    renderCard(choiceExercise('II'));
    const options = optionTexts();
    expect(options).toContain('con chó');
    expect(options).toContain('con mèo');
    expect(options).not.toContain('pes');
  });

  it('turns the round around when the variant asks for known-language options', () => {
    renderCard(choiceExercise('II', 'known'));
    const options = optionTexts();
    expect(options).toContain('pes');
    expect(options).toContain('kočka');
    expect(options).not.toContain('con chó');
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
      variant: 'words:I',
      effectiveBand: 'I',
      answerParts: ['con', 'chó'],
      distractorParts: [],
    });

    fireEvent.click(screen.getByText('con'));
    fireEvent.click(screen.getByText('chó'));
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onOutcome).toHaveBeenCalledWith('known');
  });
});


describe('StudyExerciseCard — choice audio', () => {
  const SPOKEN_WORD: NormalizedWord = {
    ...WORD,
    czAudio: 'speech/cz/pes.mp3',
    viAudio: 'speech/vi/con-cho.mp3',
  };

  let playCalls = 0;
  let audioSources: string[] = [];

  beforeEach(() => {
    localStorage.clear();
    playCalls = 0;
    audioSources = [];
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(
        this: { play: () => Promise<void>; pause: () => void },
        src: string,
      ) {
        audioSources.push(src);
        this.play = () => {
          playCalls += 1;
          return Promise.resolve();
        };
        this.pause = () => {};
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function renderSpokenChoice() {
    render(
      <StudyExerciseCard
        word={SPOKEN_WORD}
        progress={PROGRESS}
        role="knownLanguage"
        exercise={choiceExercise('I')}
        showAll={false}
        memoryHook=""
        suggestedHook=""
        onMemoryHookChange={vi.fn()}
        showMemoryHook={false}
        onKnown={vi.fn()}
        onReallyKnown={vi.fn()}
        onUnknown={vi.fn()}
        onCustomStage={vi.fn()}
        onScore={vi.fn()}
        onOutcome={vi.fn()}
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
  }

  it('speaks the answer on a correct pick by default', async () => {
    renderSpokenChoice();
    // The options are the foreign side, so the correct pick is the one spoken.
    fireEvent.click(screen.getByText('con chó'));
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('honours the sound toggle the learner flipped on a minigame card', async () => {
    localStorage.setItem('get-word-skip-sound', 'true');
    renderSpokenChoice();
    // The options are the foreign side, so the correct pick is the one spoken.
    fireEvent.click(screen.getByText('con chó'));
    await Promise.resolve();
    expect(playCalls).toBe(0);
  });
});
