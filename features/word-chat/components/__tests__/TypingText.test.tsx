import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamedText, TypingText } from '../TypingText';

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

describe('StreamedText', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('paces a burst of streamed text instead of painting it at once', () => {
    vi.useFakeTimers();
    const burst = 'Zaměříme se na formuláře a jednání u přepážky, ať to zvládnete.';
    const { container, rerender } = render(<StreamedText text="" animate />);

    // The whole reply lands in one delta, the way a buffered chunk does.
    rerender(<StreamedText text={burst} animate />);
    act(() => {
      vi.advanceTimersByTime(32);
    });
    const partial = container.textContent ?? '';
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(burst.length);
    expect(burst.startsWith(partial)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(container.textContent).toBe(burst);
  });

  it('still reveals the reply when Strict Mode remounts its frame loop', () => {
    vi.useFakeTimers();
    // The bubble appears with the first delta already in it, so the loop starts
    // during the very mount Strict Mode replays.
    const { container } = render(
      <StrictMode>
        <StreamedText text="Odpověď po druhém mountu." animate />
      </StrictMode>,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(container.textContent).toBe('Odpověď po druhém mountu.');
  });

  it('shows an already-finished reply immediately', () => {
    const { container } = render(<StreamedText text="Hotová odpověď" animate={false} />);

    expect(container.textContent).toBe('Hotová odpověď');
  });

  it('snaps to a corrected reply that is not an extension of what was shown', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<StreamedText text="Původní" animate />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(container.textContent).toBe('Původní');

    rerender(<StreamedText text="Opravená odpověď" animate />);
    expect(container.textContent).toBe('Opravená odpověď');
  });
});
