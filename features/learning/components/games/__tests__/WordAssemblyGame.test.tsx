import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NormalizedWord } from '@/lib/words';
import { WordAssemblyGame } from '../WordAssemblyGame';

const WORD: NormalizedWord = {
  id: 'assembly-word',
  cz: 'pes',
  vi: 'con chó',
  en: '',
  category: ['word'],
};

describe('WordAssemblyGame', () => {
  it('centres its constrained desktop surface', () => {
    const { container } = render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );

    expect(container.querySelector('article')).toHaveClass('mx-auto', 'max-w-2xl');
  });

  it('shows only the circular mark after a correct assembly', () => {
    render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'chó' }));

    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    expect(screen.queryByText('✓ Correct!')).not.toBeInTheDocument();
  });
});
