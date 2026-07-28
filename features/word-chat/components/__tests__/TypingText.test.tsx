import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypingText } from '../TypingText';

describe('TypingText', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('still writes the full text when Strict Mode reruns its effect', () => {
    vi.useFakeTimers();
    const { container } = render(
      <StrictMode>
        <TypingText text="Celá odpověď" animate charsPerTick={2} tickMs={10} />
      </StrictMode>,
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('Celá odpověď')).toBeInTheDocument();
    expect(container.querySelector('.word-chat-caret')).toBeNull();
  });
});
