/**
 * Pure geometry for the Photo Lab pinch-zoom. The transform applies to a
 * wrapper whose layout box equals the viewport at scale 1
 * (`transform-origin: 0 0`), so clamping only needs the viewport size.
 */

export type ZoomTransform = { scale: number; tx: number; ty: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export const IDENTITY_TRANSFORM: ZoomTransform = { scale: 1, tx: 0, ty: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Below this the transform snaps back to identity when a gesture ends. */
export const SNAP_BACK_SCALE = 1.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keep the scaled content covering the viewport (no gaps at the edges). */
export function clampTransform(t: ZoomTransform, viewport: Size): ZoomTransform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE);
  return {
    scale,
    tx: clamp(t.tx, viewport.width - viewport.width * scale, 0),
    ty: clamp(t.ty, viewport.height - viewport.height * scale, 0),
  };
}

/**
 * Continue a pinch: rescale by the distance ratio while keeping the content
 * point that was under the previous midpoint under the new midpoint.
 * Points are in viewport-local coordinates.
 */
export function applyPinch(
  t: ZoomTransform,
  prevMid: Point,
  prevDist: number,
  mid: Point,
  dist: number,
  viewport: Size,
): ZoomTransform {
  if (prevDist <= 0) return clampTransform(t, viewport);
  const scale = clamp(t.scale * (dist / prevDist), MIN_SCALE, MAX_SCALE);
  const ratio = scale / t.scale;
  return clampTransform(
    {
      scale,
      tx: mid.x - (prevMid.x - t.tx) * ratio,
      ty: mid.y - (prevMid.y - t.ty) * ratio,
    },
    viewport,
  );
}

/** Zoom to a target scale keeping the content under `point` fixed (double-tap). */
export function zoomAtPoint(
  t: ZoomTransform,
  point: Point,
  targetScale: number,
  viewport: Size,
): ZoomTransform {
  const scale = clamp(targetScale, MIN_SCALE, MAX_SCALE);
  const ratio = scale / t.scale;
  return clampTransform(
    {
      scale,
      tx: point.x - (point.x - t.tx) * ratio,
      ty: point.y - (point.y - t.ty) * ratio,
    },
    viewport,
  );
}
