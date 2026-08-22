import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WordCard } from '../WordCard';
import { STAGES, type NormalizedWord } from '@/lib/words';

const word: NormalizedWord = {
  id: 'test-1',
  cz: 'pes',
  vi: 'con chó',
  en: 'dog',
  category: ['animal'],
};

const baseProps = {
  word,
  role: 'knownLanguage' as const,
  modeIndex: 0,
  showAll: true,
  memoryHook: '',
  suggestedHook: '',
  onKnown: vi.fn(),
  onUnknown: vi.fn(),
  onMemoryHookChange: vi.fn(),
};

const TOP_STAGE = STAGES.length - 1;
const atTopStage = {
  stageIndex: TOP_STAGE,
  knownCount: 9,
  unknownCount: 1,
  nextDueAt: Date.now() - 1000,
};

// The offer button and the popover row share the same label, so count matches
// instead of asserting a single element.
const offerButtons = () => screen.getAllByRole('button', { name: /fully known/i });

describe('WordCard fully-known offer', () => {
  it('offers retirement once a word reaches the 60-day stage', () => {
    const onCustomStage = vi.fn();
    render(
      <WordCard {...baseProps} progress={atTopStage} onCustomStage={onCustomStage} />
    );

    const buttons = offerButtons();
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onCustomStage).toHaveBeenCalledWith(TOP_STAGE, { noRepeat: true });
  });

  it('does not offer retirement below the 60-day stage', () => {
    render(
      <WordCard
        {...baseProps}
        progress={{ stageIndex: TOP_STAGE - 1, knownCount: 5, unknownCount: 0, nextDueAt: Date.now() }}
        onCustomStage={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /fully known/i })).toBeNull();
  });

  it('does not re-offer retirement for a word that is already retired', () => {
    render(
      <WordCard
        {...baseProps}
        progress={{ stageIndex: TOP_STAGE, knownCount: 9, unknownCount: 0, nextDueAt: undefined }}
        onCustomStage={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /fully known/i })).toBeNull();
  });

  it('falls back to the legacy really-known handler', () => {
    const onReallyKnown = vi.fn();
    render(
      <WordCard {...baseProps} progress={atTopStage} onReallyKnown={onReallyKnown} />
    );

    fireEvent.click(offerButtons()[0]);
    expect(onReallyKnown).toHaveBeenCalledTimes(1);
  });
});
