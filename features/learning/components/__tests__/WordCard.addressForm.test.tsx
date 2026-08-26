import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordCard } from '../WordCard';
import type { NormalizedWord } from '@/lib/words';

const pairWord: NormalizedWord = {
  id: 'twin-familiar',
  cz: 'How are you?',
  vi: 'Wie geht es dir?',
  en: '',
  category: ['phrase'],
  addressForm: { form: 'familiar', counterpart: 'Wie geht es Ihnen?' },
};

const baseProps = {
  word: pairWord,
  progress: { stageIndex: 1, knownCount: 0, unknownCount: 0, nextDueAt: undefined },
  role: 'knownLanguage' as const,
  modeIndex: 0,
  memoryHook: '',
  suggestedHook: '',
  onKnown: vi.fn(),
  onUnknown: vi.fn(),
  onMemoryHookChange: vi.fn(),
};

describe('WordCard address form', () => {
  it('shows the chip while the answer is still covered', () => {
    // The two cards of a pair ask the same question, so without this the
    // learner cannot know which wording is wanted — and would be marked wrong
    // for producing the other, equally correct one.
    const { container } = render(
      <WordCard {...baseProps} showAll={false} progress={{ stageIndex: 1, knownCount: 1, unknownCount: 0 }} />,
    );

    const chip = container.querySelector('[data-address-form="familiar"]');
    expect(chip).not.toBeNull();
    expect(chip).toHaveTextContent('Casual');
  });

  it('keeps the chip outside the covered rows', () => {
    const { container } = render(
      <WordCard {...baseProps} showAll={false} progress={{ stageIndex: 1, knownCount: 1, unknownCount: 0 }} />,
    );

    const chip = container.querySelector('[data-address-form="familiar"]');
    expect(chip?.closest('.is-covered')).toBeNull();
  });

  it('puts the counterpart inside the target row, so it hides with the answer', () => {
    // "Zdvořile: Wie geht es Ihnen?" shown before the learner answers would be
    // a two-letter hint at the answer they are being asked to produce.
    const { container } = render(<WordCard {...baseProps} showAll />);

    const counterpart = screen.getByText('Polite: Wie geht es Ihnen?');
    const targetRow = container.querySelector('[data-lang="vi"]');
    expect(targetRow).not.toBeNull();
    expect(targetRow?.contains(counterpart)).toBe(true);
  });

  it('renders no chip for an ordinary word', () => {
    const { container } = render(
      <WordCard
        {...baseProps}
        showAll
        word={{ id: 'w', cz: 'chleba', vi: 'Brot', en: '', category: ['word'] }}
      />,
    );

    expect(container.querySelector('[data-address-form]')).toBeNull();
  });

  it('renders the chip alone when the twin is gone', () => {
    const { container } = render(
      <WordCard {...baseProps} showAll word={{ ...pairWord, addressForm: { form: 'polite' } }} />,
    );

    expect(container.querySelector('[data-address-form="polite"]')).toHaveTextContent('Polite');
    expect(screen.queryByText(/Casual:/)).toBeNull();
  });
});
