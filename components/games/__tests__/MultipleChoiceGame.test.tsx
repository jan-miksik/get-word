import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultipleChoiceGame } from '../MultipleChoiceGame';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

// words[0] is always the question word
const WORDS = [
  makeWord('a', 'pes', 'con chó'),
  makeWord('b', 'kočka', 'con mèo'),
  makeWord('c', 'auto', 'xe hơi'),
  makeWord('d', 'voda', 'nước'),
];

describe('MultipleChoiceGame', () => {
  it('calls onResult(true) when the correct option is selected', () => {
    const onResult = vi.fn();
    render(
      <MultipleChoiceGame words={WORDS} role="cz" onResult={onResult} />
    );
    // role=cz: prompt=pes, correct answer=con chó
    fireEvent.click(screen.getByText('con chó'));
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it('calls onResult(false) when a wrong option is selected', () => {
    const onResult = vi.fn();
    render(
      <MultipleChoiceGame words={WORDS} role="cz" onResult={onResult} />
    );
    // role=cz: prompt=pes, wrong answer=con mèo
    fireEvent.click(screen.getByText('con mèo'));
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('does not throw when onResult is not provided', () => {
    render(<MultipleChoiceGame words={WORDS} role="cz" />);
    fireEvent.click(screen.getByText('con chó'));
    // no assertion needed - just must not throw
  });
});
