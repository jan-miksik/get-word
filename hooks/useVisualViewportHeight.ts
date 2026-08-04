'use client';

import { useEffect } from 'react';
import { isTypingField } from '@/lib/typing-field';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Share of the screen a portrait phone keyboard covers, used *only* when the
 * platform reports no keyboard at all (see `apply`). Deliberately on the
 * generous side: over-reserving compacts the card, under-reserving hides the
 * bottom of it, which is the bug this exists to fix. Includes iOS's
 * form-assistant bar (the ‹ › Done row and the QuickType strip above the keys),
 * which measured on an iPhone is part of what Safari itself subtracts.
 */
const ASSUMED_KEYBOARD_SHARE = 0.48;

/** Smaller viewport changes than this are browser chrome, not a keyboard. */
const KEYBOARD_DETECTION_THRESHOLD = 80;

/**
 * How long the platform gets to report the keyboard before the assumption is
 * used instead. Long enough for a `visualViewport` resize to land, short enough
 * that a keyboard which is never reported does not leave the card hidden.
 */
const PLATFORM_REPORT_GRACE_MS = 350;

/**
 * Publishes the height of the *actually usable* viewport as
 * `--app-viewport-height` on `<html>`, for `.app` to size itself by (see
 * `styles/layout.css`).
 *
 * `100dvh` is supposed to be that number, and on Android it is. iOS is where it
 * breaks down, in three ways this app runs into:
 *
 * - The app is a `height: 100dvh; overflow: hidden` shell, so the document
 *   never scrolls and Safari never collapses its bottom toolbar. `dvh` is not
 *   re-resolved when that bar comes back, which leaves the bottom strip of the
 *   shell — the card's answer buttons — underneath it.
 * - Safari ignores `interactiveWidget`. When the keyboard opens, the layout
 *   viewport keeps its full height and Safari scrolls the *window* to bring the
 *   focused field above the keys, pushing the top of the app off the screen.
 * - The keyboard is not always reported at all. Where neither viewport moves
 *   when the keys come up, the page keeps its full height and the bottom third
 *   of the card — the hint button, the memory-hook field — is simply drawn
 *   behind the keyboard, while WebKit scrolls its own scroll view to the caret
 *   once typing starts, which is the "it shoots to the top" half of the same
 *   report.
 *
 * So the height is measured where the platform gives a measurement and assumed
 * where it does not. Measured on an iPhone SE in Safari, `visualViewport.height`
 * goes 549 → 287 with the keys up, which is the keyboard *and* its accessory
 * bar: what Safari reports is already the whole obscured strip and nothing is
 * reserved on top of it.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport ?? null;
    let frame = 0;
    let keyboardOpen = false;
    /** Set once the platform has had its grace period to report a keyboard. */
    let assumeKeyboard = false;
    let graceTimer = 0;
    let focusTimer = 0;
    /**
     * The height to measure the keyboard against: the last one seen while no
     * text field had focus. `innerHeight` alone cannot play this part — where
     * the keyboard *is* reported by resizing the web view, it is already the
     * shrunken number.
     */
    let baseHeight = window.innerHeight;

    const apply = () => {
      frame = 0;
      // Pinch-zoom shrinks the visual viewport too, and resizing the app to the
      // zoomed-in slice would reflow the page under the reader's fingers.
      if (viewport && viewport.scale > 1.01) {
        root.style.removeProperty('--app-viewport-height');
        return;
      }

      const reported = Math.round(viewport?.height ?? window.innerHeight);
      // A hidden tab or a collapsed pane measures zero. Sizing the shell to
      // that would collapse the app for the moment it comes back.
      if (reported < 1) return;
      if (!keyboardOpen) {
        baseHeight = Math.max(window.innerHeight, reported);
        root.style.setProperty('--app-viewport-height', `${reported}px`);
      } else {
        // `reported` is only worth trusting once it has actually moved: the
        // build that hides the card behind the keyboard is the one that keeps
        // reporting the full height. The assumption waits for the grace period,
        // so a platform that does report is never second-guessed and the shell
        // resizes once rather than twice.
        const platformReported =
          reported <= baseHeight - KEYBOARD_DETECTION_THRESHOLD ||
          window.innerHeight <= baseHeight - KEYBOARD_DETECTION_THRESHOLD;
        const visible =
          platformReported || !assumeKeyboard
            ? reported
            : baseHeight - Math.round(baseHeight * ASSUMED_KEYBOARD_SHARE);
        root.style.setProperty('--app-viewport-height', `${Math.max(240, visible)}px`);
      }

      // Safari may already have scrolled the window to lift a focused field
      // above the keyboard, and WebKit repeats that from its own scroll view on
      // every keystroke. Now that the shell is only as tall as the visible area
      // the field is in view without it, and the offset is pure damage: it is
      // the header and the card's prompt sliding off the top.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    // Both viewport events matter: `resize` for the keyboard and the toolbars,
    // `scroll` for the moment Safari shifts the visual viewport inside the
    // layout one.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    const syncKeyboard = () => {
      const open =
        window.matchMedia?.(MOBILE_QUERY).matches === true &&
        navigator.maxTouchPoints > 0 &&
        isTypingField(document.activeElement);
      if (open === keyboardOpen) return;
      keyboardOpen = open;
      window.clearTimeout(graceTimer);
      assumeKeyboard = false;
      // What is left of a phone screen under a keyboard is not enough for a
      // study card with its answer buttons and the menu above it, so the
      // surfaces that can give rows up read this and do (see
      // `styles/top-menu.css`, `styles/word-card.css`). Distinct from the
      // `data-app-keyboard` the add-words screen sets for itself: this one is
      // the app-wide fact, not that screen's own layout switch.
      if (open) root.dataset.appTyping = 'true';
      else delete root.dataset.appTyping;
      if (open) {
        graceTimer = window.setTimeout(() => {
          assumeKeyboard = true;
          schedule();
        }, PLATFORM_REPORT_GRACE_MS);
        // Only while the keys are up: this listener exists to undo the web
        // view's own scroll to the caret, and outside that window it would be
        // pinning down scrolling that is nobody's business but the page's.
        window.addEventListener('scroll', schedule);
      } else {
        window.removeEventListener('scroll', schedule);
      }
      schedule();
    };

    // Focus is the one keyboard signal every iOS build agrees on. `focusout`
    // fires before the next field's `focusin`, so re-read the active element
    // after the pair has settled rather than flickering the shell shut and open.
    const handleFocusChange = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(syncKeyboard, 0);
    };

    apply();
    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    // The window events are the fallback: a rotation or a plain window resize
    // does not always come with a `visualViewport` event of its own, and a
    // stale height here is the very bug this hook exists to fix.
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(graceTimer);
      window.clearTimeout(focusTimer);
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('scroll', schedule);
      root.style.removeProperty('--app-viewport-height');
      delete root.dataset.appTyping;
    };
  }, []);
}
