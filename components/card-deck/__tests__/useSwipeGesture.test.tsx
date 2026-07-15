import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useSwipeGesture, type UseSwipeGestureOptions } from '../useSwipeGesture';
import { isCardSwipeActive } from '@/lib/swipe-gesture-state';
import { firePointer, swipeRight, swipeUp } from './pointer-test-utils';

function Host({
  enabled = true,
  allowHorizontal = true,
  getWordId = () => 'w1',
  onCommit,
}: Partial<UseSwipeGestureOptions> & Pick<UseSwipeGestureOptions, 'onCommit'>) {
  const swipe = useSwipeGesture({ enabled, allowHorizontal, getWordId, onCommit });
  return (
    <div data-testid="card" ref={swipe.cardRef} onPointerDown={swipe.onPointerDown}>
      <div ref={swipe.contentRef} data-testid="content">
        <button data-testid="inner-button">action</button>
      </div>
      <div ref={swipe.rightBadgeRef} data-testid="right-badge" />
      <div ref={swipe.leftBadgeRef} data-testid="left-badge" />
      <div ref={swipe.topBadgeRef} data-testid="top-badge" />
    </div>
  );
}

const setup = (props?: Partial<UseSwipeGestureOptions>) => {
  const onCommit = vi.fn();
  const utils = render(<Host onCommit={onCommit} {...props} />);
  return { onCommit, card: utils.getByTestId('card'), ...utils };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('useSwipeGesture', () => {
  it('commits a right swipe once with the word id captured at pointerdown', () => {
    const wordIds = ['w1', 'w2'];
    let readCount = 0;
    const { onCommit, card } = setup({
      // The id source changes after the gesture starts (simulates a rerender
      // swapping the current item mid-drag); the commit must use the first id.
      getWordId: () => wordIds[Math.min(readCount++, wordIds.length - 1)],
    });
    swipeRight(card);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('right', 'w1');
  });

  it('commits using the pointerup coordinates even when the last move was below threshold', () => {
    const { onCommit, card } = setup();
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    // 50px is past the axis lock but below the 112px commit distance…
    firePointer(window, 'pointermove', { clientX: 150, clientY: 202, timeStamp: 1100 });
    // …and the release lands well past it.
    firePointer(window, 'pointerup', { clientX: 300, clientY: 202, timeStamp: 1200 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('right', 'w1');
  });

  it('commits an upward swipe as fully known', () => {
    const { onCommit, card } = setup();
    swipeUp(card);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('up', 'w1');
  });

  it('ignores left/right drags when horizontal swipe is disabled but keeps up-swipe', () => {
    const { onCommit, card } = setup({ allowHorizontal: false });

    swipeRight(card);
    expect(onCommit).not.toHaveBeenCalled();
    expect(card.style.transform).toBe('');
    expect(isCardSwipeActive()).toBe(false);

    swipeUp(card);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('up', 'w1');
  });

  it('springs back below the thresholds without committing', () => {
    const { onCommit, card } = setup();
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    firePointer(window, 'pointermove', { clientX: 130, clientY: 202, timeStamp: 1050 });
    // 50px over 100ms = 0.5 px/ms: under both distance and flick velocity.
    firePointer(window, 'pointerup', { clientX: 150, clientY: 202, timeStamp: 1100 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(isCardSwipeActive()).toBe(false);
  });

  it('lets downward vertical movement go to scroll untouched', () => {
    const { onCommit, card } = setup();
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    firePointer(window, 'pointermove', { clientX: 102, clientY: 260, timeStamp: 1050 });
    expect(isCardSwipeActive()).toBe(false);
    expect(card.style.transform).toBe('');
    firePointer(window, 'pointerup', { clientX: 102, clientY: 300, timeStamp: 1100 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('never starts on interactive elements', () => {
    const { onCommit, card, getByTestId } = setup();
    firePointer(getByTestId('inner-button'), 'pointerdown', {
      clientX: 100,
      clientY: 200,
      timeStamp: 1000,
    });
    firePointer(window, 'pointermove', { clientX: 300, clientY: 202, timeStamp: 1050 });
    firePointer(window, 'pointerup', { clientX: 300, clientY: 202, timeStamp: 1100 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(card.style.transform).toBe('');
  });

  it('ignores mouse pointers', () => {
    const { onCommit, card } = setup();
    firePointer(card, 'pointerdown', {
      pointerType: 'mouse',
      clientX: 100,
      clientY: 200,
      timeStamp: 1000,
    });
    firePointer(window, 'pointermove', { pointerType: 'mouse', clientX: 300, clientY: 202, timeStamp: 1050 });
    firePointer(window, 'pointerup', { pointerType: 'mouse', clientX: 300, clientY: 202, timeStamp: 1100 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('claims the scratch ownership flag only while dragging', () => {
    const { card } = setup();
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    expect(isCardSwipeActive()).toBe(false);
    firePointer(window, 'pointermove', { clientX: 150, clientY: 202, timeStamp: 1050 });
    expect(isCardSwipeActive()).toBe(true);
    firePointer(window, 'pointerup', { clientX: 300, clientY: 202, timeStamp: 1100 });
    expect(isCardSwipeActive()).toBe(false);
  });

  it('releases the ownership flag on pointercancel without committing', () => {
    const { onCommit, card } = setup();
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    firePointer(window, 'pointermove', { clientX: 200, clientY: 202, timeStamp: 1050 });
    expect(isCardSwipeActive()).toBe(true);
    firePointer(window, 'pointercancel', { clientX: 200, clientY: 202, timeStamp: 1100 });
    expect(isCardSwipeActive()).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('stays committed after a commit: a second gesture on the same card cannot fire again', () => {
    const { onCommit, card } = setup();
    swipeRight(card);
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The host never called reset() and no new card node arrived, so the
    // state machine is terminal — the next touch must not commit.
    swipeRight(card);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(isCardSwipeActive()).toBe(false);
  });

  it('sets the fling custom properties at commit time', () => {
    const { card } = setup();
    swipeRight(card);
    expect(card.style.getPropertyValue('--swipe-from-x')).toBe('200px');
    expect(card.style.getPropertyValue('--swipe-to-x')).toMatch(/px$/);
    expect(card.style.getPropertyValue('--swipe-to-rot')).toBe('15deg');
    expect(card.style.getPropertyValue('--swipe-from-opacity')).not.toBe('');
    expect(card.style.getPropertyValue('--swipe-to-opacity')).toBe('0');
  });

  it('fades the content layer without fading the moving shell or side badge', () => {
    const { card, getByTestId } = setup();
    swipeRight(card);
    expect(card.style.opacity).toBe('');
    expect(getByTestId('content').style.opacity).not.toBe('');
    expect(getByTestId('right-badge').style.opacity).not.toBe('');
  });

  it('sets upward fling custom properties at commit time', () => {
    const { card } = setup();
    swipeUp(card);
    expect(card.style.getPropertyValue('--swipe-from-y')).toBe('-200px');
    expect(card.style.getPropertyValue('--swipe-to-y')).toMatch(/^-.*px$/);
    expect(card.style.getPropertyValue('--swipe-to-rot')).toBe('0deg');
    expect(card.style.getPropertyValue('--swipe-from-opacity')).not.toBe('');
    expect(card.style.getPropertyValue('--swipe-to-opacity')).toBe('0');
  });

  it('releases a drag when the gesture is disabled mid-flight', () => {
    const onCommit = vi.fn();
    const { rerender, getByTestId } = render(<Host onCommit={onCommit} enabled />);
    const card = getByTestId('card');
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    firePointer(window, 'pointermove', { clientX: 200, clientY: 202, timeStamp: 1050 });
    expect(isCardSwipeActive()).toBe(true);
    rerender(<Host onCommit={onCommit} enabled={false} />);
    expect(isCardSwipeActive()).toBe(false);
    firePointer(window, 'pointerup', { clientX: 300, clientY: 202, timeStamp: 1100 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('releases everything on unmount mid-drag', () => {
    const { card, unmount } = setup();
    firePointer(card, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
    firePointer(window, 'pointermove', { clientX: 200, clientY: 202, timeStamp: 1050 });
    expect(isCardSwipeActive()).toBe(true);
    unmount();
    expect(isCardSwipeActive()).toBe(false);
  });

  describe('ghost-click suppressor', () => {
    const clickAt = (target: Element, clientX: number, clientY: number) =>
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY })
      );

    it('swallows only the swipe ghost click, leaving unrelated clicks alone', () => {
      const { card, getByTestId } = setup();
      const clickSpy = vi.fn();
      document.addEventListener('click', clickSpy);
      try {
        swipeRight(card);

        // A tap far from the deck and the commit point passes through — the
        // suppressor stays armed for the actual ghost click.
        clickAt(document.body, 900, 900);
        expect(clickSpy).toHaveBeenCalledTimes(1);

        // The ghost click lands on the flung card: swallowed (one-shot).
        clickAt(getByTestId('inner-button'), 300, 202);
        expect(clickSpy).toHaveBeenCalledTimes(1);

        // Suppressor already consumed: later clicks on the card work again.
        clickAt(getByTestId('inner-button'), 300, 202);
        expect(clickSpy).toHaveBeenCalledTimes(2);
      } finally {
        document.removeEventListener('click', clickSpy);
      }
    });

    it('expires so a later legitimate tap is never swallowed', () => {
      vi.useFakeTimers();
      const { card, getByTestId } = setup();
      const clickSpy = vi.fn();
      document.addEventListener('click', clickSpy);
      try {
        swipeRight(card);
        vi.advanceTimersByTime(500);
        clickAt(getByTestId('inner-button'), 300, 202);
        expect(clickSpy).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener('click', clickSpy);
      }
    });
  });
});
