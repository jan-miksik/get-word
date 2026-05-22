'use client';

import { useEffect } from 'react';

type PressHandlerContainer = React.RefObject<HTMLElement | null> | HTMLElement | null;
type RevealFamiliarityLevel = 'new' | 'introduced' | 'familiar' | 'practiced' | 'fluent';

const REVEAL_FAMILIARITY_STORAGE_KEY = 'get-word-reveal-familiarity-count';
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

function writeRevealFamiliarityCount(count: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REVEAL_FAMILIARITY_STORAGE_KEY, String(count));
  document.documentElement.dataset.revealFamiliarity = getRevealFamiliarityLevel(count);
}

function syncRevealFamiliarityAttribute() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.revealFamiliarity = getRevealFamiliarityLevel(
    readRevealFamiliarityCount()
  );
}

/**
 * Attaches press (mousedown / touchstart) state handlers to all `.cover-target`
 * elements inside `container`, including elements added later via DOM mutations
 * (virtualized lists).
 */
export function usePressHandlers(
  containerRef: PressHandlerContainer,
  deps: React.DependencyList
) {
  useEffect(() => {
    const container = resolveContainer(containerRef);
    if (!container) return;

    syncRevealFamiliarityAttribute();

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
      const SCROLL_THRESHOLD = 5;
      const PRESS_DELAY = 150;

      const countRevealPress = () => {
        if (countedRevealPress || !element.classList.contains('is-covered')) return;
        countedRevealPress = true;
        writeRevealFamiliarityCount(readRevealFamiliarityCount() + 1);
      };

      const setPressed = (value: boolean) => {
        pressed = value;
        if (pressed) {
          countRevealPress();
          element.classList.add('is-pressed');
        } else {
          element.classList.remove('is-pressed');
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
        if (event.touches.length > 0 && touchStartX !== 0) {
          const deltaX = Math.abs(event.touches[0].clientX - touchStartX);
          const deltaY = Math.abs(event.touches[0].clientY - touchStartY);
          if (Math.max(deltaX, deltaY) > SCROLL_THRESHOLD) {
            hasMoved = true;
            isScrolling = true;
            setPressed(false);
            if (pressTimeout) {
              clearTimeout(pressTimeout);
              pressTimeout = null;
            }
            return;
          }
          if (!isScrolling && pressed) event.preventDefault();
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
  }, [containerRef, ...deps]);
}
