'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IDENTITY_TRANSFORM,
  SNAP_BACK_SCALE,
  applyPinch,
  clampTransform,
  zoomAtPoint,
  type Point,
  type ZoomTransform,
} from './zoomGeometry';

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_RADIUS_PX = 25;
const DOUBLE_TAP_SCALE = 2.5;
/** Cumulative pointer movement beyond which the gesture is a pan/pinch, not a tap. */
const TAP_SLOP_PX = 8;
const ANIMATION_MS = 200;

type PointerHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
};

/**
 * Pinch-zoom + pan + double-tap for the photo viewport. The returned transform
 * goes on an inner wrapper (`transform-origin: 0 0`) whose layout box equals
 * the viewport; geometry lives in zoomGeometry.ts.
 *
 * Gesture model: `touch-action: pan-y` at scale 1 (vertical page scroll keeps
 * working, the browser does no native pinch), `none` while zoomed so our pan
 * owns all directions.
 */
export function usePhotoZoom(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  active = true,
) {
  const [transform, setTransformState] = useState<ZoomTransform>(IDENTITY_TRANSFORM);
  const [animating, setAnimating] = useState(false);
  const transformRef = useRef<ZoomTransform>(IDENTITY_TRANSFORM);

  const setTransform = useCallback(
    (update: ZoomTransform | ((current: ZoomTransform) => ZoomTransform)) => {
      setTransformState((current) => {
        const next = typeof update === 'function' ? update(current) : update;
        transformRef.current = next;
        return next;
      });
    },
    [],
  );

  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ mid: Point; dist: number } | null>(null);
  const movedPxRef = useRef(0);
  const isGesturingRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewportSize = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 1, height: rect?.height ?? 1 };
  }, [viewportRef]);

  const localPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = viewportRef.current?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    },
    [viewportRef],
  );

  const animateTo = useCallback((next: ZoomTransform) => {
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    setAnimating(true);
    setTransform(next);
    animationTimerRef.current = setTimeout(() => setAnimating(false), ANIMATION_MS + 20);
  }, [setTransform]);

  const reset = useCallback(() => {
    animateTo(IDENTITY_TRANSFORM);
  }, [animateTo]);

  // Keep the transform valid across viewport resizes / device rotation.
  useEffect(() => {
    if (!active) return;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const rect = viewport.getBoundingClientRect();
      setTransform((t) => clampTransform(t, { width: rect.width, height: rect.height }));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [active, setTransform, viewportRef]);

  useEffect(
    () => () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // The click from the previous gesture (if any) has been dispatched by now.
      if (pointersRef.current.size === 0) {
        isGesturingRef.current = false;
        movedPxRef.current = 0;
      }
      const target = e.target as HTMLElement | null;
      // Pointer capture retargets the following click to the viewport in desktop
      // browsers. Interactive children must keep native pointer ownership so
      // label buttons can reveal/focus and form controls can accept typing.
      if (target?.closest('button, input, textarea, select, a, [data-photo-label], [data-photo-control]')) {
        return;
      }
      pointersRef.current.set(e.pointerId, localPoint(e.clientX, e.clientY));
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort (may throw for departed pointers).
      }
      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        pinchRef.current = {
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          dist: Math.hypot(a.x - b.x, a.y - b.y),
        };
        setAnimating(false);
      }
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      const point = localPoint(e.clientX, e.clientY);
      pointers.set(e.pointerId, point);
      movedPxRef.current += Math.hypot(point.x - previous.x, point.y - previous.y);
      if (movedPxRef.current > TAP_SLOP_PX) isGesturingRef.current = true;

      if (pointers.size === 2 && pinchRef.current) {
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const { mid: prevMid, dist: prevDist } = pinchRef.current;
        pinchRef.current = { mid, dist };
        setTransform((t) => applyPinch(t, prevMid, prevDist, mid, dist, viewportSize()));
        return;
      }

      if (pointers.size === 1 && transformRef.current.scale > 1) {
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        setTransform((t) =>
          clampTransform({ scale: t.scale, tx: t.tx + dx, ty: t.ty + dy }, viewportSize()),
        );
      }
    },
    [localPoint, setTransform, viewportSize],
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);

      if (pointers.size < 2) pinchRef.current = null;
      if (pointers.size > 0) return;

      // Gesture finished entirely.
      if (transformRef.current.scale <= SNAP_BACK_SCALE && transformRef.current.scale !== 1) {
        animateTo(IDENTITY_TRANSFORM);
      }

      if (cancelled || isGesturingRef.current) {
        lastTapRef.current = null;
        return;
      }

      // Clean tap: double-tap zoom, except on label chips (their second tap
      // must keep toggling/typing, never zoom).
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-photo-label]')) {
        lastTapRef.current = null;
        return;
      }
      const now = Date.now();
      const point = localPoint(e.clientX, e.clientY);
      const lastTap = lastTapRef.current;
      if (
        lastTap &&
        now - lastTap.time < DOUBLE_TAP_MS &&
        Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < DOUBLE_TAP_RADIUS_PX
      ) {
        lastTapRef.current = null;
        const zoomed = transformRef.current.scale > 1;
        animateTo(
          zoomed
            ? IDENTITY_TRANSFORM
            : zoomAtPoint(transformRef.current, point, DOUBLE_TAP_SCALE, viewportSize()),
        );
      } else {
        lastTapRef.current = { time: now, x: point.x, y: point.y };
      }
    },
    [animateTo, localPoint, viewportSize],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => endPointer(e, false),
    [endPointer],
  );
  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => endPointer(e, true),
    [endPointer],
  );

  // Swallow the click that follows a pan/pinch so chips don't toggle after a drag.
  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isGesturingRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handlers: PointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };

  return { transform, animating, handlers, reset };
}
