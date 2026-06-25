'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

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

    const localPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const scratchTo = (event: PointerEvent) => {
      if (!countedThisCard) {
        countedThisCard = true;
        incrementScratchFamiliarityCount();
      }
      const { x, y } = localPoint(event);
      if (hasLast) {
        erodeLine(lastX, lastY, x, y);
      } else {
        erodeAt(x, y);
      }
      lastX = x;
      lastY = y;
      hasLast = true;
    };

    // Scratch on plain movement (no button required) plus the initial contact;
    // touch only emits pointermove while the finger is down, so this naturally
    // becomes a drag on touch and a hover on mouse.
    const onPointerMove = (event: PointerEvent) => {
      event.preventDefault();
      scratchTo(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      hasLast = false;
      scratchTo(event);
    };

    const endStroke = () => {
      hasLast = false;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerenter', endStroke);
    canvas.addEventListener('pointerleave', endStroke);
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);

    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerenter', endStroke);
      canvas.removeEventListener('pointerleave', endStroke);
      canvas.removeEventListener('pointerup', endStroke);
      canvas.removeEventListener('pointercancel', endStroke);
    };
  }, [label]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="scratch-cover absolute inset-0 z-[4] cursor-pointer touch-none select-none rounded-xl"
    />
  );
}
