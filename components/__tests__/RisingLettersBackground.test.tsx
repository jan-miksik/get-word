import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RisingLettersBackground } from '../RisingLettersBackground';

/**
 * The letters rise entirely in CSS. The only thing the animation loop adds is
 * `--ix`/`--iy`, the offset that lets them follow a cursor — so with nothing to
 * follow there is nothing for it to do, and running it anyway cost a forced
 * layout per frame on the loading screen, where the main thread is already busy
 * with the boot fetch.
 */

let frameCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
  frameCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallbacks.push(cb);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RisingLettersBackground', () => {
  it('runs no animation loop when there is no cursor to follow', () => {
    render(<RisingLettersBackground variant="loader" count={8} snapToMouse={false} />);

    expect(frameCallbacks).toHaveLength(0);
  });

  it('still runs the loop when the letters do follow the cursor', () => {
    render(<RisingLettersBackground variant="ambient" count={8} />);

    expect(frameCallbacks.length).toBeGreaterThan(0);
  });

  it('leaves the follow offset at rest so the CSS animation keeps the letters', () => {
    const { container } = render(
      <RisingLettersBackground variant="loader" count={4} snapToMouse={false} />,
    );

    const letters = container.querySelectorAll<HTMLElement>('.rising-letter');
    expect(letters).toHaveLength(4);
    for (const letter of letters) {
      expect(letter.style.getPropertyValue('--ix')).toBe('0px');
      expect(letter.style.getPropertyValue('--iy')).toBe('0px');
    }
  });
});
