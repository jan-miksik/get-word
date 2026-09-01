import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDeviceTiltStoreForTests } from '@/features/learning/hooks/useDeviceTilt';
import type { NormalizedWord } from '@/lib/words';
import { TiltChoiceGame } from '../TiltChoiceGame';

const WORDS: NormalizedWord[] = [
  { id: 'a', cz: 'pes', vi: 'con chó', en: '', category: ['word'] },
  { id: 'b', cz: 'kočka', vi: 'con mèo', en: '', category: ['word'] },
];

let nextFrameId = 1;
let frames = new Map<number, FrameRequestCallback>();
let originalClientWidth: PropertyDescriptor | undefined;
let originalOffsetWidth: PropertyDescriptor | undefined;

function runNextFrame(now: number) {
  const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!entry) throw new Error('No animation frame scheduled');
  frames.delete(entry[0]);
  act(() => entry[1](now));
}

function movePointer(element: Element, pointerType: string, clientX: number) {
  const event = new Event('pointermove', { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    clientX: { value: clientX },
  });
  fireEvent(element, event);
}

beforeEach(() => {
  resetDeviceTiltStoreForTests();
  Object.defineProperty(window, 'DeviceOrientationEvent', {
    configurable: true,
    value: undefined,
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  frames = new Map();
  nextFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));

  originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 80,
  });
});

afterEach(() => {
  resetDeviceTiltStoreForTests();
  vi.unstubAllGlobals();
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
  }
});

function prepareMouseGame(onResult = vi.fn(), isActive = true) {
  const view = render(
    <TiltChoiceGame
      words={WORDS}
      role="knownLanguage"
      sourceLang="from"
      onResult={onResult}
      isActive={isActive}
    />,
  );
  const article = view.container.querySelector('article');
  if (!article) throw new Error('Tilt card was not rendered');
  vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    right: 400,
    top: 0,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  });
  return { ...view, article, onResult };
}

// Eased displacement toward a full-right mouse target crosses COMMIT_AT (0.78)
// on the 8th frame: displayed_n = 1 - 0.82^n.
function runFrames(count: number, start = 0) {
  for (let i = 0; i < count; i += 1) runNextFrame(start + i * 16);
}

function runPendingFrames(maxFrames: number, start = 1000) {
  for (let i = 0; i < maxFrames && frames.size > 0; i += 1) {
    runNextFrame(start + i * 16);
  }
}

describe('TiltChoiceGame', () => {
  it('renders a prompt and exactly two answer options', () => {
    prepareMouseGame();
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'con chó' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'con mèo' })).toBeInTheDocument();
  });

  it('scores correct, level-2 and wrong taps without double answering', () => {
    const correct = vi.fn();
    const first = render(
      <TiltChoiceGame words={WORDS} role="knownLanguage" sourceLang="from" onResult={correct} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'con chó' }));
    fireEvent.click(screen.getByRole('button', { name: 'con mèo' }));
    expect(correct).toHaveBeenCalledTimes(1);
    expect(correct).toHaveBeenCalledWith(1);
    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    expect(screen.queryByText('✓ Correct!')).not.toBeInTheDocument();
    first.unmount();

    const levelTwo = vi.fn();
    const second = render(
      <TiltChoiceGame
        words={WORDS}
        role="knownLanguage"
        sourceLang="from"
        level={2}
        onResult={levelTwo}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'con chó' }));
    expect(levelTwo).toHaveBeenCalledWith(1);
    second.unmount();

    const wrong = vi.fn();
    render(
      <TiltChoiceGame words={WORDS} role="knownLanguage" sourceLang="from" onResult={wrong} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'con mèo' }));
    expect(wrong).toHaveBeenCalledWith(0);
    expect(screen.getByText(/✗\s+con chó/)).toBeInTheDocument();
  });

  it('commits only after the displacement eases past the commit threshold', () => {
    const { article, onResult } = prepareMouseGame();
    movePointer(article, 'mouse', 400);
    runFrames(7);
    expect(onResult).not.toHaveBeenCalled();
    runPendingFrames(5, 200);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('rewinds the option fill and never commits when the tilt backs off', () => {
    const { article, container, onResult } = prepareMouseGame();
    const rightFill = container.querySelectorAll<HTMLElement>('.tilt-choice-fill')[1];
    movePointer(article, 'mouse', 400);
    runFrames(5);
    expect(onResult).not.toHaveBeenCalled();
    expect(rightFill.style.transform).not.toBe('scaleX(0)');

    movePointer(article, 'mouse', 200);
    runFrames(15, 200);
    expect(onResult).not.toHaveBeenCalled();
    expect(rightFill.style.transform).toBe('scaleX(0)');
  });

  it('commits the other side after the direction flips', () => {
    const { article, onResult } = prepareMouseGame();
    movePointer(article, 'mouse', 400);
    runFrames(5);
    movePointer(article, 'mouse', 0);
    runPendingFrames(30, 200);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('does not let a click race with in-progress tilt motion', () => {
    const { article, onResult } = prepareMouseGame();
    movePointer(article, 'mouse', 400);
    runFrames(5);
    fireEvent.click(screen.getByRole('button', { name: 'con chó' }));
    expect(onResult).toHaveBeenCalledTimes(1);
    runPendingFrames(5, 200);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('never auto-answers an inactive card', () => {
    const { article, onResult } = prepareMouseGame(vi.fn(), false);
    movePointer(article, 'mouse', 400);
    for (const now of [0, 100, 200, 400, 800]) runNextFrame(now);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('ignores touch pointer movement as a mouse fallback', () => {
    const { article, onResult } = prepareMouseGame();
    movePointer(article, 'touch', 400);
    for (const now of [0, 100, 200, 400, 800]) runNextFrame(now);
    expect(onResult).not.toHaveBeenCalled();
  });
});
