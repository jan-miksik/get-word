import { useCallback, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRevealFamiliarityLevel, usePressHandlers } from '../usePressHandlers';

function DelayedPressTargets() {
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const bindContainer = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);

  usePressHandlers(container, []);

  if (!mounted) {
    return (
      <button type="button" onClick={() => setMounted(true)}>
        Mount card
      </button>
    );
  }

  return (
    <main ref={bindContainer}>
      <span className="cover-target">hidden word</span>
    </main>
  );
}

function PressTargets({
  covered = true,
  label = 'hidden word',
}: {
  covered?: boolean;
  label?: string;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const bindContainer = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);

  usePressHandlers(container, []);

  return (
    <main ref={bindContainer}>
      <span className={`cover-target ${covered ? 'is-covered' : ''}`}>{label}</span>
    </main>
  );
}

describe('usePressHandlers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.revealFamiliarity;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches handlers when the container mounts after the first effect', () => {
    render(<DelayedPressTargets />);

    fireEvent.click(screen.getByText('Mount card'));
    const target = screen.getByText('hidden word');

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');

    fireEvent.mouseUp(window);
    expect(target).not.toHaveClass('is-pressed');
  });

  it('counts covered reveal presses in localStorage and updates the familiarity attribute', () => {
    render(<PressTargets />);

    const target = screen.getByText('hidden word');
    fireEvent.mouseDown(target);

    expect(window.localStorage.getItem('get-word-reveal-familiarity-count')).toBe('1');
    expect(document.documentElement.dataset.revealFamiliarity).toBe('new');
  });

  it('does not count uncovered presses', () => {
    render(<PressTargets covered={false} label="visible word" />);

    fireEvent.mouseDown(screen.getByText('visible word'));

    expect(window.localStorage.getItem('get-word-reveal-familiarity-count')).toBeNull();
  });

  it('does not count a touch reveal when scrolling cancels the press delay', () => {
    vi.useFakeTimers();
    render(<PressTargets />);

    const target = screen.getByText('hidden word');
    fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchMove(target, { touches: [{ clientX: 10, clientY: 30 }] });
    vi.advanceTimersByTime(200);

    expect(window.localStorage.getItem('get-word-reveal-familiarity-count')).toBeNull();
    expect(target).not.toHaveClass('is-pressed');
  });

  it('maps reveal familiarity counts to adaptive hint levels', () => {
    expect(getRevealFamiliarityLevel(0)).toBe('new');
    expect(getRevealFamiliarityLevel(4)).toBe('introduced');
    expect(getRevealFamiliarityLevel(9)).toBe('familiar');
    expect(getRevealFamiliarityLevel(16)).toBe('practiced');
    expect(getRevealFamiliarityLevel(28)).toBe('fluent');
  });
});
