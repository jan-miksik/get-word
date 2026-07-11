'use client';

import { useCallback, useEffect, useRef } from 'react';
import { beginCardSwipe, endCardSwipe } from '@/lib/swipe-gesture-state';
import {
  FALLBACK_CARD_HEIGHT,
  FALLBACK_CARD_WIDTH,
  getSwipeCommitDirection,
  getSwipeVisuals,
  getUpSwipeCommit,
  getUpSwipeVisuals,
  resolveSwipeAxis,
  type SwipeDirection,
} from './swipe-logic';

// Interactive elements keep their own gestures; a swipe never starts on them.
// `.scratch-cover` stays scratchable — strokes on a covered answer are reveals,
// not swipes.
const IGNORED_SWIPE_TARGETS =
  'button, input, textarea, select, a, [role="button"], .scratch-cover, [data-swipe-ignore]';

// Window of recent pointer samples used for flick velocity, so one noisy event
// near release can't decide the commit.
const VELOCITY_WINDOW_MS = 80;
const SPRING_BACK_MS = 250;
const SPRING_BACK_CLEANUP_MS = 300;
const GHOST_CLICK_WINDOW_MS = 450;
const GHOST_CLICK_RADIUS = 24;
const FINAL_ROTATION_DEG = 15;
const MIN_DRAG_OPACITY = 0.38;
const TOP_BADGE_LIFT_START = 0.55;
const TOP_BADGE_LIFT_PX = 32;

type GestureState = 'idle' | 'tracking' | 'dragging' | 'committed';

interface GestureSession {
  pointerId: number;
  startX: number;
  startY: number;
  wordId: string;
  width: number;
  height: number;
  dx: number;
  dy: number;
  /** Which drag we claimed once the axis lock resolved. */
  claimed: 'horizontal' | 'up' | null;
  samples: { x: number; y: number; t: number }[];
  swipeToken: symbol | null;
}

export interface UseSwipeGestureOptions {
  enabled: boolean;
  /** Read at pointerdown; the gesture keeps this id so a mid-drag rerender can't retarget the mark. */
  getWordId: () => string | null;
  onCommit: (direction: SwipeDirection, wordId: string) => void;
}

export interface UseSwipeGestureResult {
  cardRef: (node: HTMLDivElement | null) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  leftBadgeRef: React.RefObject<HTMLDivElement | null>;
  rightBadgeRef: React.RefObject<HTMLDivElement | null>;
  topBadgeRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  /** Spring the card back and return to idle (used when advance() didn't start an exit). */
  reset: () => void;
}

export function useSwipeGesture({
  enabled,
  getWordId,
  onCommit,
}: UseSwipeGestureOptions): UseSwipeGestureResult {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const leftBadgeRef = useRef<HTMLDivElement | null>(null);
  const rightBadgeRef = useRef<HTMLDivElement | null>(null);
  const topBadgeRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GestureState>('idle');
  const sessionRef = useRef<GestureSession | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const springBackCleanupRef = useRef<(() => void) | null>(null);
  const suppressorCleanupRef = useRef<(() => void) | null>(null);
  const detachWindowListenersRef = useRef<(() => void) | null>(null);

  // Latest-value refs so the stable event handlers never act on stale props.
  const enabledRef = useRef(enabled);
  const getWordIdRef = useRef(getWordId);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    enabledRef.current = enabled;
    getWordIdRef.current = getWordId;
    onCommitRef.current = onCommit;
  });

  const cancelVisualFrame = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const setBadgeOpacities = useCallback((left: number, right: number, top = 0) => {
    if (leftBadgeRef.current) leftBadgeRef.current.style.opacity = String(left);
    if (rightBadgeRef.current) rightBadgeRef.current.style.opacity = String(right);
    if (topBadgeRef.current) topBadgeRef.current.style.opacity = String(top);
  }, []);

  const setTopBadgeLift = useCallback((badgeOpacity: number) => {
    const topBadge = topBadgeRef.current;
    if (!topBadge) return;
    const liftProgress =
      badgeOpacity <= TOP_BADGE_LIFT_START
        ? 0
        : (badgeOpacity - TOP_BADGE_LIFT_START) / (1 - TOP_BADGE_LIFT_START);
    topBadge.style.setProperty('--swipe-top-badge-y', `${-TOP_BADGE_LIFT_PX * liftProgress}px`);
  }, []);

  const applyDragVisuals = useCallback(() => {
    const node = nodeRef.current;
    const session = sessionRef.current;
    if (!node || !session) return;
    const fadeNode = contentRef.current ?? node;
    if (session.claimed === 'up') {
      // The card only follows upward travel; below the start point it stays put.
      const dy = Math.min(0, session.dy);
      const { badgeOpacity } = getUpSwipeVisuals(session.dy, session.height);
      node.style.transform = `translateY(${dy}px)`;
      fadeNode.style.opacity = String(1 - badgeOpacity * (1 - MIN_DRAG_OPACITY));
      setTopBadgeLift(badgeOpacity);
      setBadgeOpacities(0, 0, badgeOpacity);
      return;
    }
    const { rotationDeg, badgeOpacity, direction } = getSwipeVisuals(session.dx, session.width);
    node.style.transform = `translateX(${session.dx}px) rotate(${rotationDeg}deg)`;
    fadeNode.style.opacity = String(1 - badgeOpacity * (1 - MIN_DRAG_OPACITY));
    setBadgeOpacities(
      direction === 'left' ? badgeOpacity : 0,
      direction === 'right' ? badgeOpacity : 0
    );
    setTopBadgeLift(0);
  }, [setBadgeOpacities, setTopBadgeLift]);

  const flushVisualsNow = useCallback(() => {
    cancelVisualFrame();
    applyDragVisuals();
  }, [cancelVisualFrame, applyDragVisuals]);

  const scheduleVisualUpdate = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      applyDragVisuals();
    });
  }, [applyDragVisuals]);

  const removeClickSuppressor = useCallback(() => {
    suppressorCleanupRef.current?.();
  }, []);

  const installClickSuppressor = useCallback(
    (commitX: number, commitY: number) => {
      removeClickSuppressor();
      const onClickCapture = (event: MouseEvent) => {
        const node = nodeRef.current;
        const insideDeck =
          node !== null && event.target instanceof Node && node.contains(event.target);
        const nearCommit =
          Math.abs(event.clientX - commitX) <= GHOST_CLICK_RADIUS &&
          Math.abs(event.clientY - commitY) <= GHOST_CLICK_RADIUS;
        // Only swallow the click the swipe itself produced; unrelated taps
        // (e.g. the last-card overlay elsewhere on screen) pass through.
        if (!insideDeck && !nearCommit) return;
        event.preventDefault();
        event.stopPropagation();
        cleanup();
      };
      const timeoutId = window.setTimeout(() => cleanup(), GHOST_CLICK_WINDOW_MS);
      const cleanup = () => {
        window.removeEventListener('click', onClickCapture, true);
        window.clearTimeout(timeoutId);
        suppressorCleanupRef.current = null;
      };
      window.addEventListener('click', onClickCapture, true);
      suppressorCleanupRef.current = cleanup;
    },
    [removeClickSuppressor]
  );

  // Level-1 cleanup: stop tracking the pointer but keep gesture state and the
  // ghost-click suppressor (the commit path needs both to survive).
  const detachPointerTracking = useCallback(() => {
    detachWindowListenersRef.current?.();
    cancelVisualFrame();
    const session = sessionRef.current;
    if (session?.swipeToken) {
      endCardSwipe(session.swipeToken);
      session.swipeToken = null;
    }
  }, [cancelVisualFrame]);

  const clearSpringBack = useCallback(() => {
    springBackCleanupRef.current?.();
  }, []);

  const clearCardStyles = useCallback((node: HTMLDivElement) => {
    node.style.transform = '';
    node.style.transition = '';
    node.style.willChange = '';
    node.style.opacity = '';
    if (contentRef.current) contentRef.current.style.opacity = '';
    topBadgeRef.current?.style.removeProperty('--swipe-top-badge-y');
    node.style.removeProperty('--swipe-from-x');
    node.style.removeProperty('--swipe-from-y');
    node.style.removeProperty('--swipe-from-rot');
    node.style.removeProperty('--swipe-to-x');
    node.style.removeProperty('--swipe-to-y');
    node.style.removeProperty('--swipe-to-rot');
    node.style.removeProperty('--swipe-from-opacity');
    node.style.removeProperty('--swipe-to-opacity');
  }, []);

  // Level-2 cleanup: back to idle, everything cleared. With springBack the
  // transform eases out first and the transition is cleared on transitionend
  // (timeout fallback), so the spring animation isn't cancelled mid-flight.
  const resetGesture = useCallback(
    ({ springBack }: { springBack: boolean }) => {
      detachPointerTracking();
      removeClickSuppressor();
      clearSpringBack();
      stateRef.current = 'idle';
      sessionRef.current = null;
      setBadgeOpacities(0, 0);
      setTopBadgeLift(0);
      const node = nodeRef.current;
      if (!node) return;
      node.style.removeProperty('--swipe-from-x');
      node.style.removeProperty('--swipe-from-y');
      node.style.removeProperty('--swipe-from-rot');
      node.style.removeProperty('--swipe-to-x');
      node.style.removeProperty('--swipe-to-y');
      node.style.removeProperty('--swipe-to-rot');
      node.style.removeProperty('--swipe-from-opacity');
      node.style.removeProperty('--swipe-to-opacity');
      const fadeNode = contentRef.current ?? node;
      if (springBack && (node.style.transform || fadeNode.style.opacity)) {
        node.style.transition =
          `transform ${SPRING_BACK_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1), ` +
          `opacity ${SPRING_BACK_MS}ms ease-out`;
        if (fadeNode !== node) {
          fadeNode.style.transition = `opacity ${SPRING_BACK_MS}ms ease-out`;
        }
        node.style.transform = '';
        fadeNode.style.opacity = '';
        const finish = () => {
          node.removeEventListener('transitionend', finish);
          window.clearTimeout(timeoutId);
          springBackCleanupRef.current = null;
          node.style.transition = '';
          node.style.willChange = '';
          if (fadeNode !== node) fadeNode.style.transition = '';
        };
        const timeoutId = window.setTimeout(finish, SPRING_BACK_CLEANUP_MS);
        node.addEventListener('transitionend', finish);
        springBackCleanupRef.current = finish;
      } else {
        clearCardStyles(node);
      }
    },
    [detachPointerTracking, removeClickSuppressor, clearSpringBack, setBadgeOpacities, setTopBadgeLift, clearCardStyles]
  );

  const ingestSample = useCallback((x: number, y: number, t: number) => {
    const session = sessionRef.current;
    if (!session) return;
    session.dx = x - session.startX;
    session.dy = y - session.startY;
    session.samples.push({ x, y, t });
    while (session.samples.length > 1 && t - session.samples[0].t > VELOCITY_WINDOW_MS) {
      session.samples.shift();
    }
  }, []);

  const getVelocityX = useCallback((): number => {
    const session = sessionRef.current;
    if (!session || session.samples.length < 2) return 0;
    const first = session.samples[0];
    const last = session.samples[session.samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }, []);

  const getVelocityY = useCallback((): number => {
    const session = sessionRef.current;
    if (!session || session.samples.length < 2) return 0;
    const first = session.samples[0];
    const last = session.samples[session.samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (last.y - first.y) / dt : 0;
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      ingestSample(event.clientX, event.clientY, event.timeStamp);
      if (stateRef.current === 'tracking') {
        const axis = resolveSwipeAxis(session.dx, session.dy);
        if (axis === 'vertical' && session.dy > 0) {
          // Downward: scroll owns the gesture; let it proceed untouched.
          detachPointerTracking();
          stateRef.current = 'idle';
          sessionRef.current = null;
          return;
        }
        if (axis === 'horizontal' || axis === 'vertical') {
          const node = nodeRef.current;
          if (!node) return;
          stateRef.current = 'dragging';
          // Upward vertical = "really known"; downward vertical is ignored so
          // it never commits as a review action.
          session.claimed = axis === 'horizontal' ? 'horizontal' : 'up';
          session.swipeToken = beginCardSwipe();
          node.style.transition = 'none';
          node.style.willChange = 'transform';
        }
      }
      if (stateRef.current === 'dragging') scheduleVisualUpdate();
    },
    [ingestSample, detachPointerTracking, scheduleVisualUpdate]
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      if (stateRef.current === 'tracking') {
        // Tap or undecided wiggle: fall through to the card's own handlers.
        detachPointerTracking();
        stateRef.current = 'idle';
        sessionRef.current = null;
        return;
      }
      if (stateRef.current !== 'dragging') return;

      if (event.type === 'pointercancel') {
        resetGesture({ springBack: true });
        return;
      }

      // The pointer can move between the last pointermove and pointerup; take
      // the release coordinates as the final sample before deciding.
      ingestSample(event.clientX, event.clientY, event.timeStamp);
      const direction =
        session.claimed === 'up'
          ? getUpSwipeCommit(session.dy, getVelocityY(), session.height)
          : getSwipeCommitDirection(session.dx, getVelocityX(), session.width);
      if (!direction) {
        resetGesture({ springBack: true });
        return;
      }

      const node = nodeRef.current;
      if (!node) {
        resetGesture({ springBack: false });
        return;
      }
      const fadeNode = contentRef.current ?? node;

      stateRef.current = 'committed';
      flushVisualsNow();
      if (direction === 'up') {
        const exitDistance =
          Math.max(window.innerHeight || 0, session.height, FALLBACK_CARD_HEIGHT) * 1.25;
        node.style.setProperty('--swipe-from-x', '0px');
        node.style.setProperty('--swipe-from-y', `${Math.min(0, session.dy)}px`);
        node.style.setProperty('--swipe-from-rot', '0deg');
        node.style.setProperty('--swipe-from-opacity', fadeNode.style.opacity || '1');
        node.style.setProperty('--swipe-to-x', '0px');
        node.style.setProperty('--swipe-to-y', `${-exitDistance}px`);
        node.style.setProperty('--swipe-to-rot', '0deg');
        node.style.setProperty('--swipe-to-opacity', '0');
      } else {
        const { rotationDeg } = getSwipeVisuals(session.dx, session.width);
        const sign = direction === 'right' ? 1 : -1;
        const exitDistance =
          Math.max(window.innerWidth || 0, session.width, FALLBACK_CARD_WIDTH) * 1.25;
        node.style.setProperty('--swipe-from-x', `${session.dx}px`);
        node.style.setProperty('--swipe-from-y', '0px');
        node.style.setProperty('--swipe-from-rot', `${rotationDeg}deg`);
        node.style.setProperty('--swipe-from-opacity', fadeNode.style.opacity || '1');
        node.style.setProperty('--swipe-to-x', `${sign * exitDistance}px`);
        node.style.setProperty('--swipe-to-y', '0px');
        node.style.setProperty('--swipe-to-rot', `${sign * FINAL_ROTATION_DEG}deg`);
        node.style.setProperty('--swipe-to-opacity', '0');
      }
      const wordId = session.wordId;
      detachPointerTracking();
      installClickSuppressor(event.clientX, event.clientY);
      try {
        onCommitRef.current(direction, wordId);
      } catch (error) {
        resetGesture({ springBack: true });
        throw error;
      }
      // `committed` is terminal: no new gesture until reset() or the next card
      // node arrives, so a second fast touch can't commit the same card twice.
    },
    [
      ingestSample,
      getVelocityX,
      getVelocityY,
      detachPointerTracking,
      flushVisualsNow,
      installClickSuppressor,
      resetGesture,
    ]
  );

  const onPointerDown = useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (!enabledRef.current) return;
      if (stateRef.current !== 'idle') return;
      if (!event.isPrimary) return;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const target = event.target;
      if (target instanceof Element && target.closest(IGNORED_SWIPE_TARGETS)) return;
      const wordId = getWordIdRef.current();
      if (!wordId) return;
      const node = nodeRef.current;
      if (!node) return;

      // A leftover spring-back transition would animate the first drag frames.
      clearSpringBack();
      node.style.transition = '';

      sessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        wordId,
        width: node.clientWidth || FALLBACK_CARD_WIDTH,
        height: node.clientHeight || FALLBACK_CARD_HEIGHT,
        dx: 0,
        dy: 0,
        claimed: null,
        samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }],
        swipeToken: null,
      };
      stateRef.current = 'tracking';

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerEnd);
      window.addEventListener('pointercancel', handlePointerEnd);
      detachWindowListenersRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerEnd);
        window.removeEventListener('pointercancel', handlePointerEnd);
        detachWindowListenersRef.current = null;
      };
    },
    [clearSpringBack, handlePointerMove, handlePointerEnd]
  );

  // Stable identity: an unstable callback ref would be detached/reattached on
  // ordinary rerenders (oldRef(null) → newRef(node)) and cancel a live drag.
  const cardRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (nodeRef.current === node) return;
      // The previous card is gone (deck items remount per card via key):
      // drop the whole gesture, no spring-back on a detached node.
      detachPointerTracking();
      removeClickSuppressor();
      clearSpringBack();
      stateRef.current = 'idle';
      sessionRef.current = null;
      setBadgeOpacities(0, 0, 0);
      setTopBadgeLift(0);
      nodeRef.current = node;
    },
    [detachPointerTracking, removeClickSuppressor, clearSpringBack, setBadgeOpacities, setTopBadgeLift]
  );

  const reset = useCallback(() => {
    resetGesture({ springBack: true });
  }, [resetGesture]);

  // Disabling mid-drag (settings toggle, deck state change) releases the
  // gesture; badge cleanup matters if the card stays mounted. `committed` is
  // deliberately left alone — the deck disables the gesture while the swipe
  // exit animation plays, and a reset here would strip the --swipe-* custom
  // properties out from under it.
  useEffect(() => {
    if (enabled) return;
    if (stateRef.current !== 'tracking' && stateRef.current !== 'dragging') return;
    resetGesture({ springBack: true });
  }, [enabled, resetGesture]);

  useEffect(
    () => () => {
      detachPointerTracking();
      removeClickSuppressor();
      clearSpringBack();
    },
    [detachPointerTracking, removeClickSuppressor, clearSpringBack]
  );

  return { cardRef, contentRef, leftBadgeRef, rightBadgeRef, topBadgeRef, onPointerDown, reset };
}
