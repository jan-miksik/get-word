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

export function getProgressiveRevealMask(text: string, revealedCharacters: number): string {
  let remaining = Math.max(0, revealedCharacters);
  return Array.from(text.trim()).map((character) => {
    if (!/[\p{L}\p{N}]/u.test(character)) return character;
    if (remaining > 0) {
      remaining -= 1;
      return character;
    }
    return '•';
  }).join('');
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
  progressiveRevealEnabled = true
) {
  useEffect(() => {
    const container = resolveContainer(containerRef);
    if (!container) return;

    const previewFreshReveal = isFreshRevealPreviewEnabled();
    let previewRevealCount = previewFreshReveal ? previewRevealCountMemory : 0;
    if (previewFreshReveal) {
      applyRevealFamiliarity(previewRevealCount);
    } else {
      syncRevealFamiliarityAttribute();
    }
    document.documentElement.dataset.progressiveReveal = progressiveRevealEnabled
      ? 'enabled'
      : 'disabled';

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
      let hasRevealedInitial = false;
      let progressiveRevealTimer: number | null = null;
      let revealOpacityFrame: number | null = null;
      const SCROLL_THRESHOLD = 5;
      const PRESS_DELAY = 150;
      const PROGRESSIVE_REVEAL_INTERVAL = 450;

      const clearProgressiveRevealTimer = () => {
        if (progressiveRevealTimer !== null) {
          window.clearInterval(progressiveRevealTimer);
          progressiveRevealTimer = null;
        }
      };

      const updateProgressiveMask = (revealedCharacters: number) => {
        const text = element.dataset.revealText ?? '';
        const textElement = element.querySelector<HTMLElement>('.lang-text');
        if (!textElement) return;
        // Debug/test mirror of the masked string; the rendered spans below are
        // what the user actually sees.
        textElement.dataset.revealMask = getProgressiveRevealMask(text, revealedCharacters);

        let maskElement = textElement.querySelector<HTMLElement>('.reveal-mask');
        if (!maskElement) {
          maskElement = document.createElement('span');
          maskElement.className = 'reveal-mask';
          maskElement.setAttribute('aria-hidden', 'true');
          textElement.appendChild(maskElement);
        }

        // Each character is its own span so only the newest revealed letter
        // animates in, while already-revealed letters and dots stay put.
        const chars: HTMLSpanElement[] = [];
        let revealableIndex = 0;
        for (const character of Array.from(text.trim())) {
          const span = document.createElement('span');
          span.className = 'reveal-char';
          if (/[\p{L}\p{N}]/u.test(character)) {
            const indexForChar = revealableIndex;
            revealableIndex += 1;
            if (indexForChar < revealedCharacters) {
              span.textContent = character;
              if (indexForChar === revealedCharacters - 1) {
                span.classList.add('reveal-char--in');
              }
            } else {
              span.textContent = '•';
              span.classList.add('reveal-char--dot');
            }
          } else {
            span.textContent = character;
          }
          chars.push(span);
        }
        maskElement.replaceChildren(...chars);
      };

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
          if (
            progressiveRevealEnabled &&
            !hasRevealedInitial &&
            element.classList.contains('is-covered') &&
            element.dataset.revealText
          ) {
            element.classList.add('is-first-letter-reveal');
            hasRevealedInitial = true;
            let revealedCharacters = 1;
            updateProgressiveMask(revealedCharacters);
            progressiveRevealTimer = window.setInterval(() => {
              revealedCharacters += 1;
              updateProgressiveMask(revealedCharacters);
              const text = element.dataset.revealText ?? '';
              const revealableCharacters = Array.from(text).filter((character) =>
                /[\p{L}\p{N}]/u.test(character)
              ).length;
              if (revealedCharacters >= revealableCharacters) {
                clearProgressiveRevealTimer();
              }
            }, PROGRESSIVE_REVEAL_INTERVAL);
          } else {
            element.classList.remove('is-first-letter-reveal');
          }
          element.classList.add('is-pressed');
        } else {
          clearProgressiveRevealTimer();
          element.classList.remove('is-pressed');
          element.classList.remove('is-first-letter-reveal');
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
        clearProgressiveRevealTimer();
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
  }, [containerRef, progressiveRevealEnabled, ...deps]);
}
