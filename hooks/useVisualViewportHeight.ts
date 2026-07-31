'use client';

import { useEffect } from 'react';

/**
 * Publishes the height of the *actually visible* viewport as
 * `--app-viewport-height` on `<html>`, for `.app` to size itself by (see
 * `styles/layout.css`).
 *
 * `100dvh` is supposed to be that number, and on Android it is. iOS Safari is
 * where it breaks down, in two ways this app runs into:
 *
 * - The app is a `height: 100dvh; overflow: hidden` shell, so the document
 *   never scrolls and Safari never collapses its bottom toolbar. `dvh` is not
 *   re-resolved when that bar comes back, which leaves the bottom strip of the
 *   shell — the card's answer buttons — underneath it.
 * - Safari ignores `interactiveWidget`. When the keyboard opens, the layout
 *   viewport keeps its full height and Safari scrolls the *window* to bring the
 *   focused field above the keys, pushing the top of the app off the screen.
 *
 * `visualViewport.height` is the one measurement that is right in both cases,
 * so the shell follows it and the window scroll is put back where a
 * non-scrolling app expects it.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      frame = 0;
      // Pinch-zoom shrinks the visual viewport too, and resizing the app to the
      // zoomed-in slice would reflow the page under the reader's fingers.
      if (viewport.scale > 1.01) {
        root.style.removeProperty('--app-viewport-height');
        return;
      }
      root.style.setProperty('--app-viewport-height', `${Math.round(viewport.height)}px`);
      // Safari may already have scrolled the window to lift a focused field
      // above the keyboard. Now that the shell is only as tall as the visible
      // area the field is in view without it, and the offset is pure damage:
      // it is the header and the chat's opening lines sliding off the top.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    // Both events matter: `resize` for the keyboard and the toolbars, `scroll`
    // for the moment Safari shifts the visual viewport inside the layout one.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    apply();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    // The window events are the fallback: a rotation or a plain window resize
    // does not always come with a `visualViewport` event of its own, and a
    // stale height here is the very bug this hook exists to fix.
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.style.removeProperty('--app-viewport-height');
    };
  }, []);
}
