import { fireEvent } from '@testing-library/react';

export interface PointerInit {
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
  clientX: number;
  clientY: number;
  /** Explicit timestamp (ms) so velocity math is deterministic in tests. */
  timeStamp?: number;
}

// jsdom's PointerEvent constructor doesn't reliably apply every PointerEventInit
// field, and Event.timeStamp is never settable via init — so build a plain
// event and define the fields directly. React's synthetic events and native
// window listeners both read them off the instance.
export function firePointer(
  target: Element | Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: PointerInit
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? 'touch' },
    isPrimary: { value: init.isPrimary ?? true },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    ...(init.timeStamp !== undefined ? { timeStamp: { value: init.timeStamp } } : {}),
  });
  fireEvent(target, event);
}

/** down → move (crossing the axis lock) → up, far enough right to commit. */
export function swipeRight(card: Element, distance = 200): void {
  firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
  firePointer(window, 'pointermove', { clientX: 100 + distance / 2, clientY: 202, timeStamp: 1050 });
  firePointer(window, 'pointerup', { clientX: 100 + distance, clientY: 202, timeStamp: 1100 });
}

export function swipeLeft(card: Element, distance = 200): void {
  firePointer(card, 'pointerdown', { clientX: 400, clientY: 200, timeStamp: 1000 });
  firePointer(window, 'pointermove', { clientX: 400 - distance / 2, clientY: 202, timeStamp: 1050 });
  firePointer(window, 'pointerup', { clientX: 400 - distance, clientY: 202, timeStamp: 1100 });
}

export function swipeUp(card: Element, distance = 200): void {
  firePointer(card, 'pointerdown', { clientX: 240, clientY: 360, timeStamp: 1000 });
  firePointer(window, 'pointermove', { clientX: 240, clientY: 360 - distance / 2, timeStamp: 1050 });
  firePointer(window, 'pointerup', { clientX: 240, clientY: 360 - distance, timeStamp: 1100 });
}
