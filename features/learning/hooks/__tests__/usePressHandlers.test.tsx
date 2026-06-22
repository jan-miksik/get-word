import { useCallback, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isFreshRevealPreviewEnabled,
  getRevealFamiliarityLevel,
  getRevealHintOpacity,
  usePressHandlers,
} from '../usePressHandlers';

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
      <span
        className={`cover-target ${covered ? 'is-covered' : ''}`}
      >
        <span className="lang-text">{label}</span>
      </span>
    </main>
  );
}

describe('usePressHandlers', () => {
  const getCoverTarget = (label: string) =>
    screen.getByText(label).closest<HTMLElement>('.cover-target')!;

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    delete document.documentElement.dataset.revealFamiliarity;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches handlers when the container mounts after the first effect', () => {
    render(<DelayedPressTargets />);

    fireEvent.click(screen.getByText('Mount card'));
    const target = getCoverTarget('hidden word');

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');

    fireEvent.mouseUp(window);
    expect(target).not.toHaveClass('is-pressed');
  });

  it('counts covered reveal presses in localStorage and updates the familiarity attribute', () => {
    render(<PressTargets />);

    const target = getCoverTarget('hidden word');
    fireEvent.mouseDown(target);
    fireEvent.mouseUp(window);

    expect(window.localStorage.getItem('get-word-reveal-familiarity-count')).toBe('1');
    expect(document.documentElement.dataset.revealFamiliarity).toBe('new');
  });

  it('does not count uncovered presses', () => {
    render(<PressTargets covered={false} label="visible word" />);

    fireEvent.mouseDown(screen.getByText('visible word'));

    expect(window.localStorage.getItem('get-word-reveal-familiarity-count')).toBeNull();
  });

  it('reveals the full word immediately on every press', () => {
    render(<PressTargets />);
    const target = getCoverTarget('hidden word');

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');
    expect(target).not.toHaveClass('is-first-letter-reveal');
    expect(target.querySelector('.reveal-mask')).toBeNull();
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');
    expect(target).not.toHaveClass('is-first-letter-reveal');
  });

  it('still reveals the full word after the effect re-runs between presses', () => {
    function ReRunningPressTargets() {
      const [container, setContainer] = useState<HTMLElement | null>(null);
      const [revision, setRevision] = useState(0);
      const bindContainer = useCallback((node: HTMLElement | null) => {
        setContainer(node);
      }, []);
      usePressHandlers(container, [revision]);
      return (
        <main ref={bindContainer}>
          <button type="button" onClick={() => setRevision((r) => r + 1)}>
            bump deps
          </button>
          <span className="cover-target is-covered">
            <span className="lang-text">hidden word</span>
          </span>
        </main>
      );
    }

    render(<ReRunningPressTargets />);
    const target = getCoverTarget('hidden word');

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');
    expect(target.querySelector('.reveal-mask')).toBeNull();
    fireEvent.mouseUp(window);

    // Force the press-handler effect to tear down and re-attach.
    fireEvent.click(screen.getByText('bump deps'));

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');
    expect(target).not.toHaveClass('is-first-letter-reveal');
    fireEvent.mouseUp(window);
  });

  it('keeps the full reveal visible while held if the finger jitters past the threshold', () => {
    vi.useFakeTimers();
    render(<PressTargets label="hello" />);
    const target = getCoverTarget('hello');

    fireEvent.touchStart(target, { touches: [{ clientX: 50, clientY: 50 }] });
    vi.advanceTimersByTime(150);
    expect(target).toHaveClass('is-pressed');
    expect(target.querySelector('.reveal-mask')).toBeNull();

    // iOS-style jitter beyond the scroll threshold must NOT cancel an active reveal.
    fireEvent.touchMove(target, { touches: [{ clientX: 63, clientY: 58 }] });
    expect(target).toHaveClass('is-pressed');

  });

  it('does not run progressive reveal on already-shown (uncovered) text', () => {
    render(<PressTargets covered={false} label="visible word" />);
    const target = getCoverTarget('visible word');

    fireEvent.mouseDown(target);

    expect(target).not.toHaveClass('is-first-letter-reveal');
    expect(target.querySelector('.reveal-mask')).toBeNull();
  });

  it('does not count a touch reveal when scrolling cancels the press delay', () => {
    vi.useFakeTimers();
    render(<PressTargets />);

    const target = getCoverTarget('hidden word');
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

  it('fades the hint out over seven reveal presses', () => {
    expect(getRevealHintOpacity(0)).toBe(1);
    expect(getRevealHintOpacity(1)).toBeCloseTo(6 / 7);
    expect(getRevealHintOpacity(2)).toBeCloseTo(5 / 7);
    expect(getRevealHintOpacity(7)).toBe(0);
    expect(getRevealHintOpacity(28)).toBe(0);
  });

  it('simulates a fresh reveal user through the preview URL without changing stored familiarity', () => {
    window.localStorage.setItem('get-word-reveal-familiarity-count', '20');
    window.history.replaceState({}, '', '/?previewRevealFresh=1');
    expect(isFreshRevealPreviewEnabled()).toBe(true);

    render(<PressTargets />);
    expect(document.documentElement.dataset.revealFamiliarity).toBe('new');
    expect(document.documentElement.style.getPropertyValue('--reveal-hint-opacity')).toBe('1');

    fireEvent.mouseDown(getCoverTarget('hidden word'));
    fireEvent.mouseUp(window);
    expect(window.localStorage.getItem('get-word-reveal-familiarity-count')).toBe('20');
  });
});
