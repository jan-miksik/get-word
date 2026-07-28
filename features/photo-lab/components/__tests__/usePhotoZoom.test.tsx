import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePhotoZoom } from '@/features/photo-lab/components/usePhotoZoom';

function Host({ onLabelClick, active = true }: { onLabelClick: () => void; active?: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { handlers } = usePhotoZoom(viewportRef, active);

  return (
    <div ref={viewportRef} data-testid="viewport" {...handlers}>
      <button type="button" data-photo-label onClick={onLabelClick}>
        label
      </button>
    </div>
  );
}

describe('usePhotoZoom', () => {
  it('leaves pointer ownership with label buttons so desktop clicks still fire', () => {
    const onLabelClick = vi.fn();
    const { getByRole, getByTestId } = render(<Host onLabelClick={onLabelClick} />);
    const viewport = getByTestId('viewport');
    const label = getByRole('button', { name: 'label' });
    const setPointerCapture = vi.fn();
    Object.defineProperty(viewport, 'setPointerCapture', { value: setPointerCapture });

    fireEvent.pointerDown(label, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.click(label);

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onLabelClick).toHaveBeenCalledOnce();
  });

  it('still captures gestures that begin on the photo viewport', () => {
    const { getByTestId } = render(<Host onLabelClick={() => undefined} />);
    const viewport = getByTestId('viewport');
    const setPointerCapture = vi.fn();
    Object.defineProperty(viewport, 'setPointerCapture', { value: setPointerCapture });

    fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 30, clientY: 30 });

    expect(setPointerCapture).toHaveBeenCalledWith(2);
  });

  it('does not keep a resize observer active while the photo surface is hidden', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    } as unknown as typeof ResizeObserver;

    render(<Host active={false} onLabelClick={() => undefined} />);
    expect(observe).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();

    globalThis.ResizeObserver = original;
  });
});
