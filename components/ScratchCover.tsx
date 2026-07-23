'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isCardSwipeActive } from '@/lib/swipe-gesture-state';

// Paint the cover before the browser paints so the answer never flashes
// uncovered on mount. Falls back to useEffect during SSR to avoid the warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * A canvas "scratch card" overlay. It sits opaque on top of the *already
 * visible* answer text and is erased where the pointer moves over it
 * (`destination-out`), so the real text shows through the scratched holes in
 * real time. There is no auto-complete and no "hold" — simply moving the
 * pointer across the surface scratches it, and whatever is scratched stays
 * scratched.
 *
 * Sizing is driven off the PARENT element, never the canvas's own measured size
 * — a <canvas> is a replaced element whose layout size follows its width/height
 * attributes, so reading its own size while writing the buffer would feed back
 * into an unbounded ResizeObserver growth loop.
 */

const COVER_GRADIENT_TOP = 'rgb(171, 196, 145)';
const COVER_GRADIENT_BOTTOM = 'rgb(220, 173, 141)';
const DOT_COLOR = 'rgba(60, 50, 30, 0.23)';
const LABEL_COLOR = '#f4efe1';
const ERASE_RADIUS = 40;

// Fade the "scratch to reveal" hint out once the gesture is learned: full
// strength for the first few scratched cards, then gradually to nothing.
const SCRATCH_FAMILIARITY_STORAGE_KEY = 'get-word-scratch-familiarity-count';
const LABEL_FADE_AFTER_CARDS = 0;
const LABEL_FADE_SPAN_CARDS = 3;

function readScratchFamiliarityCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const parsed = Number.parseInt(
      window.localStorage.getItem(SCRATCH_FAMILIARITY_STORAGE_KEY) ?? '0',
      10
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function incrementScratchFamiliarityCount() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SCRATCH_FAMILIARITY_STORAGE_KEY,
      String(readScratchFamiliarityCount() + 1)
    );
  } catch {
    // Counter is a nicety; ignore storage failures.
  }
}

function labelOpacityForCount(count: number): number {
  if (count <= LABEL_FADE_AFTER_CARDS) return 1;
  return Math.max(0, 1 - (count - LABEL_FADE_AFTER_CARDS) / LABEL_FADE_SPAN_CARDS);
}

export function ScratchCover({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // First-time gesture hint: an animated fingertip sweeping over the cover,
  // shown only while the visitor has never scratched a card on this device.
  // Set in an effect (not initial state) so SSR/hydration render the same
  // markup before localStorage is consulted.
  const startsUnfamiliar = useSyncExternalStore(
    () => () => {},
    () => readScratchFamiliarityCount() === 0,
    () => false,
  );
  const [hintDismissed, setHintDismissed] = useState(false);
  const showHint = startsUnfamiliar && !hintDismissed;

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Captured once per card so resizes don't change it; counts cards scratched
    // *before* this one, so each successive card's hint is a little dimmer.
    const labelAlpha = labelOpacityForCount(readScratchFamiliarityCount());
    let countedThisCard = false;
    let lastX = 0;
    let lastY = 0;
    let hasLast = false;
    let displayW = 0;
    let displayH = 0;

    const paintCover = () => {
      ctx.globalCompositeOperation = 'source-over';
      const grad = ctx.createLinearGradient(0, 0, displayW, displayH);
      grad.addColorStop(0, COVER_GRADIENT_TOP);
      grad.addColorStop(1, COVER_GRADIENT_BOTTOM);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, displayW, displayH);

      ctx.fillStyle = DOT_COLOR;
      for (let y = 6; y < displayH; y += 12) {
        for (let x = 6; x < displayW; x += 12) {
          ctx.beginPath();
          ctx.arc(x, y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (labelAlpha > 0.01) {
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '600 14px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, displayW / 2, displayH / 2, displayW - 12);
        ctx.globalAlpha = 1;
      }
    };

    const resize = () => {
      // Measure the parent, not the canvas (see file header note).
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w <= 0 || h <= 0 || (w === displayW && h === displayH)) return;
      displayW = w;
      displayH = h;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintCover();
    };

    const erodeAt = (x: number, y: number) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, ERASE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    };

    // A continuous round-capped stroke fully clears the whole path in one go,
    // so fast moves don't leave partially-scratched gaps between stamps.
    const erodeLine = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = ERASE_RADIUS * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    const clientPoint = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const inBounds = (x: number, y: number) =>
      x >= 0 && x <= displayW && y >= 0 && y <= displayH;

    // Geometry alone can't tell whether the canvas is actually the surface
    // under the finger: an open top menu, a modal, or the type answer bar may
    // be layered above it while still overlapping the canvas's rectangle. If we
    // scratched (and, on touch, preventDefault'd) purely on `inBounds`, a tap on
    // one of those overlays over the card would be swallowed — and on iOS a
    // preventDefault'd `touchstart` also cancels the synthesized click, so the
    // overlay's button never fires. Confirm the canvas is the topmost element at
    // the point (the pointer-events:none hint never intercepts) before acting.
    const isCanvasTopmost = (clientX: number, clientY: number) =>
      document.elementFromPoint(clientX, clientY) === canvas;

    const scratchAt = (x: number, y: number) => {
      if (!countedThisCard) {
        countedThisCard = true;
        incrementScratchFamiliarityCount();
        setHintDismissed(true);
      }
      if (hasLast) {
        erodeLine(lastX, lastY, x, y);
      } else {
        erodeAt(x, y);
      }
      lastX = x;
      lastY = y;
      hasLast = true;
    };

    const endStroke = () => {
      hasLast = false;
    };

    // Touch and mouse are handled by separate event families on purpose.
    //
    // On iOS, the element under the initial contact gets implicit *pointer*
    // capture and — worse — if that element allows scrolling, Safari claims the
    // gesture and never delivers usable `pointermove`s. That's why the previous
    // window-level pointer listener only worked when the finger started on the
    // cover. Native `touch` events don't have that problem: we listen on the
    // window, and once the finger travels over the canvas we `preventDefault`
    // (non-passive) to keep scratching instead of scrolling. Because we only
    // cancel while over the canvas, the page still scrolls normally elsewhere.
    const onTouchPoint = (event: TouchEvent) => {
      // A committed card swipe owns the touch; crossing the canvas mid-swipe
      // must not scratch it.
      if (isCardSwipeActive()) {
        hasLast = false;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const { x, y } = clientPoint(touch.clientX, touch.clientY);
      if (!inBounds(x, y) || !isCanvasTopmost(touch.clientX, touch.clientY)) {
        hasLast = false;
        return;
      }
      event.preventDefault();
      scratchAt(x, y);
    };

    // Mouse/pen: plain movement scratches with no button required (a hover),
    // matching the touch drag. Pointer events of type `touch` are ignored here
    // so the touch handlers above own that case.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (isCardSwipeActive()) {
        hasLast = false;
        return;
      }
      const { x, y } = clientPoint(event.clientX, event.clientY);
      if (!inBounds(x, y) || !isCanvasTopmost(event.clientX, event.clientY)) {
        hasLast = false;
        return;
      }
      scratchAt(x, y);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (isCardSwipeActive()) return;
      const { x, y } = clientPoint(event.clientX, event.clientY);
      if (!inBounds(x, y) || !isCanvasTopmost(event.clientX, event.clientY)) return;
      hasLast = false;
      scratchAt(x, y);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    window.addEventListener('touchstart', onTouchPoint, { passive: false });
    window.addEventListener('touchmove', onTouchPoint, { passive: false });
    window.addEventListener('touchend', endStroke);
    window.addEventListener('touchcancel', endStroke);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endStroke);
    window.addEventListener('pointercancel', endStroke);

    return () => {
      observer.disconnect();
      window.removeEventListener('touchstart', onTouchPoint);
      window.removeEventListener('touchmove', onTouchPoint);
      window.removeEventListener('touchend', endStroke);
      window.removeEventListener('touchcancel', endStroke);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endStroke);
      window.removeEventListener('pointercancel', endStroke);
    };
  }, [label]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="scratch-cover absolute inset-0 z-[4] cursor-pointer touch-none select-none rounded-xl"
      />
      {showHint ? (
        <span className="scratch-hint" aria-hidden="true">
          👆
        </span>
      ) : null}
    </>
  );
}
