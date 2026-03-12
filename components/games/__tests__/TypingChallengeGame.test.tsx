import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypingChallengeGame } from '../TypingChallengeGame';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

// words[0] is the question word
// role=cz: prompt=cz word, correct=vi word
const WORDS = [
  makeWord('a', 'pes', 'con chó'),
  makeWord('b', 'kočka', 'con mèo'),
];

describe('TypingChallengeGame', () => {
  it('calls onResult(2) when exact match is submitted', () => {
    const onResult = vi.fn();
    render(
      <TypingChallengeGame words={WORDS} role="cz" onResult={onResult} />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con chó' } });
    fireEvent.click(screen.getByText('Check'));
    expect(onResult).toHaveBeenCalledWith(2);
  });

  it('calls onResult(1) when close match is submitted', () => {
    const onResult = vi.fn();
    render(
      <TypingChallengeGame words={WORDS} role="cz" onResult={onResult} />
    );
    // 'con cho' is close to 'con chó' (missing diacritic)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con cho' } });
    fireEvent.click(screen.getByText('Check'));
    expect(onResult).toHaveBeenCalledWith(1);
  });

  it('calls onResult(0) when wrong answer is submitted', () => {
    const onResult = vi.fn();
    render(
      <TypingChallengeGame words={WORDS} role="cz" onResult={onResult} />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'totally wrong' } });
    fireEvent.click(screen.getByText('Check'));
    expect(onResult).toHaveBeenCalledWith(0);
  });

  it('does not throw when onResult is not provided', () => {
    render(<TypingChallengeGame words={WORDS} role="cz" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con chó' } });
    fireEvent.click(screen.getByText('Check'));
    // no assertion needed - just must not throw
  });
});
