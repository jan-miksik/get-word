'use client';

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  configFromSnapshot,
  getScratchServerSnapshot,
  getScratchSnapshot,
  NO_BASE,
  subscribeScratchConfig,
} from './scratch-field/motif-store';
import { getMotif } from './scratch-field/motifs';
import { useScratchFieldEnabled } from './scratch-field/use-scratch-enabled';
import { attachViewportCanvas } from './scratch-field/viewport-canvas';

// Paint before the browser paints so the covered layer never flashes through on
// mount. Falls back to useEffect during SSR to avoid the warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * The full-page scratch field: a decorative cover that sits *behind the page
 * content* and is rubbed away wherever the pointer travels.
 *
 * Deliberately different from {@link components/ScratchCover}, the per-card
 * scratch surface: it lives *below* the text (`-z-*`), so copy and buttons stay
 * readable and clickable at all times and the visitor scratches simply by
 * moving across the page — no hit-testing, no `preventDefault`, scrolling is
 * untouched.
 *
 * What gets revealed is either the page's own background or a second motif
 * painted by {@link ScratchFieldBase}. The cover also *comes back*: once the
 * field is essentially cleared the same gesture reverses and starts painting it
 * on again, so the page breathes between covered and uncovered instead of
 * ending up permanently stripped.
 */

// Each restore pass is partial, so the cover creeps back over a few strokes
// rather than snapping on.
const RESTORE_ALPHA = 0.32;
// Flip points for the scratch ⇄ restore cycle, as a fraction of the field.
const FLIP_TO_RESTORE_AT = 0.98;
const FLIP_TO_SCRATCH_AT = 0.02;
// Coverage is sampled from a thumbnail rather than the real canvas: 64×40 is
// enough to judge a percentage and costs almost nothing to read back.
const SAMPLE_W = 64;
const SAMPLE_H = 40;
const SAMPLE_INTERVAL_MS = 220;
// A pixel counts as scratched once it is mostly transparent.
const SCRATCHED_ALPHA_MAX = 40;

function useScratchConfig() {
  return configFromSnapshot(
    useSyncExternalStore(
      subscribeScratchConfig,
      getScratchSnapshot,
      getScratchServerSnapshot
    )
  );
}

/**
 * The colour of the *uncovered* side when no base motif is chosen. Some motifs
 * (the fogged-glass family) want the page they reveal to read as something
 * other than warm parchment, so they carry a `revealTint`.
 *
 * A separate element rather than part of {@link ScratchField} because it has to
 * sit *below* the cover in the stacking order — and, on the landing page, below
 * the ambient rising letters too.
 */
export function ScratchFieldRevealTint({ className = '' }: { className?: string }) {
  const config = useScratchConfig();
  const enabled = useScratchFieldEnabled();
  const tint = getMotif(config.cover).revealTint;
  // A base motif is opaque, so it would hide the tint anyway.
  if (!enabled || !tint || config.base !== NO_BASE) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 ${className}`}
      style={{ background: tint }}
    />
  );
}

/**
 * The second motif: a static, non-interactive surface painted under the cover,
 * so scratching reveals another texture instead of the page background.
 */
export function ScratchFieldBase({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = useScratchConfig();
  const snapshot = useSyncExternalStore(
    subscribeScratchConfig,
    getScratchSnapshot,
    getScratchServerSnapshot
  );
  const enabled = useScratchFieldEnabled();
  const hasBase = enabled && config.base !== NO_BASE;

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasBase) return;
    const paintMotif = getMotif(config.base).paint;
    return attachViewportCanvas(canvas, (ctx, w, h) => {
      paintMotif(ctx, w, h, { density: config.textureDensity });
    });
    // `snapshot` covers both the motif choice and manual repaints.
  }, [snapshot, hasBase, config.base, config.textureDensity]);

  if (!hasBase) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`scratch-field-base pointer-events-none fixed left-0 top-0 ${className}`}
    />
  );
}

export function ScratchField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = useScratchConfig();
  const enabled = useScratchFieldEnabled();
  const snapshot = useSyncExternalStore(
    subscribeScratchConfig,
    getScratchSnapshot,
    getScratchServerSnapshot
  );

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    // Not just a render guard: on touch devices this also means none of the
    // window-level touch listeners below are ever registered.
    if (!canvas || !enabled) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paintMotif = getMotif(config.cover).paint;

    // The pristine cover is kept off-screen so restoring can paint the *same*
    // texture back rather than a flat colour — scratch and re-cover the same
    // spot and the grain lines up exactly as it did.
    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d');
    const sampler = document.createElement('canvas');
    sampler.width = SAMPLE_W;
    sampler.height = SAMPLE_H;
    const samplerCtx = sampler.getContext('2d', { willReadFrequently: true });

    // Only the height is needed after painting — the coverage sampler clips to
    // the visible viewport, and brush coordinates come straight from the event.
    let displayH = 0;
    let dpr = 1;
    let coverPattern: CanvasPattern | null = null;
    let mode: 'scratch' | 'restore' = 'scratch';
    let lastX = 0;
    let lastY = 0;
    let hasLast = false;
    let dirty = false;
    let lastSampleAt = 0;
    const hasTouchEvents = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const mobileBrush = window.matchMedia?.('(max-width: 639px), (pointer: coarse)').matches;
    const brushRadius = mobileBrush ? config.mobileBrushRadius : config.desktopBrushRadius;

    const dispose = attachViewportCanvas(canvas, (context, w, h, ratio) => {
      displayH = h;
      dpr = ratio;
      if (!sourceCtx) return;
      source.width = canvas.width;
      source.height = canvas.height;
      if (source.width === 0 || source.height === 0) return;
      sourceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sourceCtx.globalCompositeOperation = 'source-over';
      sourceCtx.clearRect(0, 0, w, h);
      paintMotif(sourceCtx, w, h, { density: config.textureDensity });

      // The source bitmap is device-pixel sized while fills happen in CSS
      // pixels, so undo the ratio or the texture would be drawn at 2× on hidpi.
      // Older mobile WebViews may not expose CanvasPattern.setTransform or
      // DOMMatrix. The cover itself is already painted below, so keep the
      // untransformed pattern as a safe restore fallback instead of aborting
      // the whole paint pass on those browsers.
      try {
        coverPattern = context.createPattern(source, 'no-repeat');
        if (
          coverPattern &&
          typeof coverPattern.setTransform === 'function' &&
          typeof DOMMatrix !== 'undefined'
        ) {
          coverPattern.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr));
        }
      } catch {
        coverPattern = null;
      }

      context.drawImage(source, 0, 0, w, h);
      mode = 'scratch';
      dirty = false;
    });

    // A soft-edged brush reads as rubbed-off material rather than a punched hole.
    const eraseAt = (x: number, y: number) => {
      const grad = ctx.createRadialGradient(
        x,
        y,
        brushRadius * 0.25,
        x,
        y,
        brushRadius
      );
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    // `destination-over` only paints where the canvas is (partly) transparent,
    // so re-covering fills the scratched holes and leaves intact cover alone —
    // no seams where a new stroke crosses an old one.
    const restoreAt = (x: number, y: number) => {
      if (!coverPattern) return;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.globalAlpha = RESTORE_ALPHA;
      ctx.fillStyle = coverPattern;
      ctx.beginPath();
      ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const brush = (x: number, y: number) => {
      if (mode === 'scratch') eraseAt(x, y);
      else restoreAt(x, y);
      dirty = true;
    };

    /** Fraction of the field that is scratched away, 0–1. */
    const measureScratched = (): number => {
      if (!samplerCtx) return 0;
      samplerCtx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
      // Only the visible viewport counts. The canvas is deliberately taller,
      // and that strip can never be reached by a pointer — sampling it would
      // hold coverage permanently below the flip threshold.
      const visibleH = Math.round(Math.min(window.innerHeight, displayH) * dpr);
      samplerCtx.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        Math.max(1, visibleH),
        0,
        0,
        SAMPLE_W,
        SAMPLE_H
      );
      const { data } = samplerCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      let scratched = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] <= SCRATCHED_ALPHA_MAX) scratched += 1;
      }
      return scratched / (SAMPLE_W * SAMPLE_H);
    };

    const maybeFlipMode = (now: number) => {
      if (!dirty || now - lastSampleAt < SAMPLE_INTERVAL_MS) return;
      lastSampleAt = now;
      dirty = false;
      const scratched = measureScratched();
      if (mode === 'scratch' && scratched >= FLIP_TO_RESTORE_AT) mode = 'restore';
      else if (mode === 'restore' && scratched <= FLIP_TO_SCRATCH_AT) mode = 'scratch';
    };

    // Stamp along the segment so fast moves don't leave gaps between brushes.
    const strokeTo = (x: number, y: number) => {
      if (hasLast) {
        const dx = x - lastX;
        const dy = y - lastY;
        const steps = Math.min(Math.ceil(Math.hypot(dx, dy) / (brushRadius * 0.35)), 60);
        for (let i = 1; i <= steps; i += 1) {
          brush(lastX + (dx * i) / steps, lastY + (dy * i) / steps);
        }
      }
      brush(x, y);
      lastX = x;
      lastY = y;
      hasLast = true;
      maybeFlipMode(performance.now());
    };

    // The canvas is fixed to the viewport, so client coordinates are already
    // canvas coordinates.
    const onPointerMove = (event: PointerEvent) => {
      // Touch has its own event path below. Filtering pointer-touch avoids
      // painting every mobile gesture twice on browsers that dispatch both
      // PointerEvents and TouchEvents.
      if (event.pointerType === 'touch' && hasTouchEvents) return;
      strokeTo(event.clientX, event.clientY);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && hasTouchEvents) return;
      strokeTo(event.clientX, event.clientY);
    };

    // Touch is handled separately and passively: this layer sits under the
    // content, so it must never swallow taps or block scrolling — dragging a
    // finger scratches *and* scrolls, which is the intended feel.
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      strokeTo(touch.clientX, touch.clientY);
    };

    const endStroke = () => {
      hasLast = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', endStroke);
    window.addEventListener('pointercancel', endStroke);
    const touchCaptureOptions = { capture: true, passive: true } as const;
    document.addEventListener('touchstart', onTouchMove, touchCaptureOptions);
    document.addEventListener('touchmove', onTouchMove, touchCaptureOptions);
    document.addEventListener('touchend', endStroke, true);
    document.addEventListener('touchcancel', endStroke, true);

    return () => {
      dispose();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', endStroke);
      window.removeEventListener('pointercancel', endStroke);
      document.removeEventListener('touchstart', onTouchMove, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', endStroke, true);
      document.removeEventListener('touchcancel', endStroke, true);
    };
    // `snapshot` covers both the motif choice and manual repaints.
  }, [
    snapshot,
    config.cover,
    config.textureDensity,
    config.desktopBrushRadius,
    config.mobileBrushRadius,
    enabled,
  ]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`scratch-field pointer-events-none fixed left-0 top-0 ${className}`}
    />
  );
}

/**
 * Where the ambient rising letters belong: above the base motif (so they are
 * only visible through what has been scratched away) or above the cover (so
 * they always float on top). Returns the z-index class for the caller to apply.
 */
export function useLettersLayer(): 'base' | 'cover' {
  return useScratchConfig().letters;
}
