'use client';

import { useEffect } from 'react';

type PressHandlerContainer = React.RefObject<HTMLElement | null> | HTMLElement | null;
type RevealFamiliarityLevel = 'new' | 'introduced' | 'familiar' | 'practiced' | 'fluent';

const REVEAL_FAMILIARITY_STORAGE_KEY = 'get-word-reveal-familiarity-count';
// Preview mode (?previewRevealFresh=1) keeps its own in-memory counter so testing
// progresses across words within a session (instead of resetting on every word) but
// still starts fresh on a full page reload — and never touches the real count.
let previewRevealCountMemory = 0;
const INTRODUCED_REVEAL_COUNT = 4;
const FAMILIAR_REVEAL_COUNT = 9;
const PRACTICED_REVEAL_COUNT = 16;
const FLUENT_REVEAL_COUNT = 28;

export function getRevealFamiliarityLevel(count: number): RevealFamiliarityLevel {
  if (count >= FLUENT_REVEAL_COUNT) return 'fluent';
  if (count >= PRACTICED_REVEAL_COUNT) return 'practiced';
  if (count >= FAMILIAR_REVEAL_COUNT) return 'familiar';
  if (count >= INTRODUCED_REVEAL_COUNT) return 'introduced';
  return 'new';
}

const REVEAL_HINT_FADE_PRESSES = 7;

export function getRevealHintOpacity(count: number): number {
  return Math.max(0, 1 - Math.max(0, count) / REVEAL_HINT_FADE_PRESSES);
}

function resolveContainer(container: PressHandlerContainer): HTMLElement | null {
  if (!container) return null;
  if ('current' in container) return container.current;
  return container;
}

function readRevealFamiliarityCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(REVEAL_FAMILIARITY_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function isFreshRevealPreviewEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('previewRevealFresh') === '1';
}

function setRevealStyleVariables(count: number) {
  document.documentElement.style.setProperty(
    '--reveal-hint-opacity',
    String(getRevealHintOpacity(count))
  );
}

function applyRevealFamiliarity(count: number, deferStyle = false) {
  document.documentElement.dataset.revealFamiliarity = getRevealFamiliarityLevel(count);
  if (deferStyle) {
    window.requestAnimationFrame(() => setRevealStyleVariables(count));
  } else {
    setRevealStyleVariables(count);
  }
}

function writeRevealFamiliarityCount(count: number, deferStyle = false) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REVEAL_FAMILIARITY_STORAGE_KEY, String(count));
  applyRevealFamiliarity(count, deferStyle);
}

function syncRevealFamiliarityAttribute() {
  if (typeof document === 'undefined') return;
  applyRevealFamiliarity(readRevealFamiliarityCount());
}

/**
 * Attaches press (mousedown / touchstart) state handlers to all `.cover-target`
 * elements inside `container`, including elements added later via DOM mutations
 * (virtualized lists).
 */
export function usePressHandlers(
  containerRef: PressHandlerContainer,
  deps: React.DependencyList,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const container = resolveContainer(containerRef);
    if (!container) return;

    const previewFreshReveal = isFreshRevealPreviewEnabled();
    let previewRevealCount = previewFreshReveal ? previewRevealCountMemory : 0;
    if (previewFreshReveal) {
      applyRevealFamiliarity(previewRevealCount);
    } else {
      syncRevealFamiliarityAttribute();
    }
    const cleanupMap = new Map<HTMLElement, () => void>();

    const attachPressHandlers = (element: HTMLElement) => {
      if (cleanupMap.has(element)) return;

      let pressed = false;
      let touchStartX = 0;
      let touchStartY = 0;
      let isScrolling = false;
      let pressTimeout: number | null = null;
      let hasMoved = false;
      let countedRevealPress = false;
      let revealOpacityFrame: number | null = null;
      const SCROLL_THRESHOLD = 10;
      const PRESS_DELAY = 150;

      const countRevealPress = () => {
        if (countedRevealPress || !element.classList.contains('is-covered')) return;
        countedRevealPress = true;
        if (previewFreshReveal) {
          previewRevealCount += 1;
          previewRevealCountMemory = previewRevealCount;
          document.documentElement.dataset.revealFamiliarity = getRevealFamiliarityLevel(
            previewRevealCount
          );
          revealOpacityFrame = window.requestAnimationFrame(() => {
            setRevealStyleVariables(previewRevealCount);
            revealOpacityFrame = null;
          });
        } else {
          writeRevealFamiliarityCount(readRevealFamiliarityCount() + 1, true);
        }
      };

      const setPressed = (value: boolean) => {
        const wasPressed = pressed;
        pressed = value;
        if (pressed) {
          element.classList.add('is-pressed');
        } else {
          element.classList.remove('is-pressed');
          if (wasPressed) countRevealPress();
        }
      };

      const onDown = (event: MouseEvent | TouchEvent) => {
        countedRevealPress = false;
        if (event.type === 'touchstart' && 'touches' in event && event.touches.length > 0) {
          touchStartX = event.touches[0].clientX;
          touchStartY = event.touches[0].clientY;
          isScrolling = false;
          hasMoved = false;
          pressTimeout = window.setTimeout(() => {
            if (!isScrolling && !hasMoved) setPressed(true);
          }, PRESS_DELAY);
          return;
        }

        event.preventDefault();
        setPressed(true);
      };

      const onMove = (event: TouchEvent) => {
        if (event.touches.length === 0 || touchStartX === 0) return;

        // Once the reveal is active, keep it visible even if the finger jitters.
        // iOS fires touchmove constantly for a "stationary" finger, so just stop
        // the page from scrolling underneath the held press.
        if (pressed) {
          event.preventDefault();
          return;
        }

        const deltaX = Math.abs(event.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(event.touches[0].clientY - touchStartY);
        if (Math.max(deltaX, deltaY) > SCROLL_THRESHOLD) {
          // Moved before the press fired → treat it as a scroll and cancel the
          // pending press (the delayed setPressed checks these flags too).
          hasMoved = true;
          isScrolling = true;
          if (pressTimeout) {
            clearTimeout(pressTimeout);
            pressTimeout = null;
          }
        }
      };

      const onUp = () => {
        if (pressTimeout) {
          clearTimeout(pressTimeout);
          pressTimeout = null;
        }
        setPressed(false);
        touchStartX = 0;
        touchStartY = 0;
        isScrolling = false;
        hasMoved = false;
        countedRevealPress = false;
      };

      element.addEventListener('mousedown', onDown);
      element.addEventListener('touchstart', onDown, { passive: true });
      element.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);
      window.addEventListener('touchcancel', onUp);

      cleanupMap.set(element, () => {
        element.removeEventListener('mousedown', onDown);
        element.removeEventListener('touchstart', onDown);
        element.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('touchcancel', onUp);
        if (pressTimeout) clearTimeout(pressTimeout);
        if (revealOpacityFrame !== null) window.cancelAnimationFrame(revealOpacityFrame);
      });
    };

    container.querySelectorAll<HTMLElement>('.cover-target').forEach(attachPressHandlers);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList.contains('cover-target')) attachPressHandlers(node);
          node.querySelectorAll?.('.cover-target').forEach((child) => {
            attachPressHandlers(child as HTMLElement);
          });
        });
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          cleanupMap.get(node)?.();
          cleanupMap.delete(node);
          node.querySelectorAll?.('.cover-target').forEach((child) => {
            cleanupMap.get(child as HTMLElement)?.();
            cleanupMap.delete(child as HTMLElement);
          });
        });
      });
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupMap.forEach((cleanup) => cleanup());
      cleanupMap.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, enabled, ...deps]);
}
