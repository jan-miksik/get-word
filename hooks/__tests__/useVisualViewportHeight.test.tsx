import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewportHeight } from '../useVisualViewportHeight';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const SCREEN_HEIGHT = 812;
/** A keyboard the platform does report: 812 - 336. */
const REPORTED_VISIBLE_HEIGHT = 476;

type FakeViewport = {
  height: number;
  scale: number;
  listeners: Record<string, Array<() => void>>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  emit: (type: string) => void;
};

function createViewport(height: number): FakeViewport {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    height,
    scale: 1,
    listeners,
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] ?? []).filter((entry) => entry !== listener);
    },
    emit(type) {
      (listeners[type] ?? []).forEach((listener) => listener());
    },
  };
}

function Harness() {
  useVisualViewportHeight();
  return <input data-testid="field" />;
}

function publishedHeight(): string {
  return document.documentElement.style.getPropertyValue('--app-viewport-height');
}

/** Runs the rAF the hook schedules plus any timers that fell due. */
function flush() {
  act(() => {
    vi.advanceTimersByTime(0);
  });
}

let viewport: FakeViewport;

beforeEach(() => {
  vi.useFakeTimers();
  // rAF is not implemented in jsdom; a macrotask keeps it inside fake timers.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  viewport = createViewport(SCREEN_HEIGHT);
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: SCREEN_HEIGHT, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
  Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--app-viewport-height');
});

describe('useVisualViewportHeight', () => {
  it('publishes the visual viewport height while no field has focus', () => {
    render(<Harness />);
    flush();

    expect(publishedHeight()).toBe('812px');
  });

  it('takes the reported height as it stands when the platform reports a keyboard', () => {
    const { getByTestId } = render(<Harness />);
    flush();

    act(() => {
      getByTestId('field').focus();
    });
    viewport.height = REPORTED_VISIBLE_HEIGHT;
    act(() => {
      viewport.emit('resize');
      vi.advanceTimersByTime(400);
    });

    // Measured on an iPhone: what Safari reports already excludes the keyboard
    // and its accessory bar, so nothing further is taken off it.
    expect(publishedHeight()).toBe('476px');
    expect(document.documentElement.dataset.appTyping).toBe('true');
  });

  it('assumes a keyboard when the platform never reports one', () => {
    const { getByTestId } = render(<Harness />);
    flush();

    act(() => {
      getByTestId('field').focus();
    });
    // Neither viewport moves — the case that left the bottom of the card, hint
    // button and memory-hook field included, drawn behind the keyboard.
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // 812 less the 48% a portrait keyboard and its accessory bar cover.
    expect(publishedHeight()).toBe('422px');
  });

  it('restores the full height once the field is left', () => {
    const { getByTestId } = render(<Harness />);
    flush();

    act(() => {
      getByTestId('field').focus();
      vi.advanceTimersByTime(400);
    });
    act(() => {
      getByTestId('field').blur();
      vi.advanceTimersByTime(400);
    });

    expect(publishedHeight()).toBe('812px');
    expect(document.documentElement.dataset.appTyping).toBeUndefined();
  });

  it('leaves a focused field alone where there is no touch screen', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: DESKTOP_UA, configurable: true });
    const { getByTestId } = render(<Harness />);
    flush();

    act(() => {
      getByTestId('field').focus();
      vi.advanceTimersByTime(400);
    });

    expect(publishedHeight()).toBe('812px');
    expect(document.documentElement.dataset.appTyping).toBeUndefined();
  });

  it('cancels a pending focus update when the hook unmounts', () => {
    const { getByTestId, unmount } = render(<Harness />);
    flush();

    act(() => {
      getByTestId('field').focus();
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(publishedHeight()).toBe('');
    expect(document.documentElement.dataset.appTyping).toBeUndefined();
  });
});
