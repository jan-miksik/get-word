'use client';

import { useEffect, useState, type RefObject } from 'react';
import { isTypingField } from '@/lib/typing-field';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * True while the on-screen keyboard is (as good as certainly) covering the
 * lower half of a phone screen: a text field inside `containerRef` holds focus
 * and the layout is the single-column mobile one.
 *
 * Focus is the signal rather than a `visualViewport` measurement: the app asks
 * for `interactiveWidget: 'resizes-content'`, so on the browsers that honour it
 * the layout viewport shrinks along with the visual one and there is no
 * keyboard inset left to measure — while on the ones that do not, the page is
 * merely scrolled and the inset is equally invisible.
 */
export function useMobileKeyboardOpen(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) {
      setOpen(false);
      return;
    }

    const mobile = window.matchMedia?.(MOBILE_QUERY) ?? null;
    const sync = () => {
      setOpen(
        mobile?.matches === true &&
          container.contains(document.activeElement) &&
          isTypingField(document.activeElement),
      );
    };

    const handleFocusOut = (event: FocusEvent) => {
      // `relatedTarget` is the element about to take focus. Moving between two
      // fields keeps the keyboard up, so read the destination instead of
      // flickering the layout closed and open again.
      if (isTypingField(event.relatedTarget)) return;
      setOpen(false);
    };

    sync();
    container.addEventListener('focusin', sync);
    container.addEventListener('focusout', handleFocusOut);
    mobile?.addEventListener('change', sync);
    return () => {
      container.removeEventListener('focusin', sync);
      container.removeEventListener('focusout', handleFocusOut);
      mobile?.removeEventListener('change', sync);
    };
  }, [containerRef, enabled]);

  return open;
}
