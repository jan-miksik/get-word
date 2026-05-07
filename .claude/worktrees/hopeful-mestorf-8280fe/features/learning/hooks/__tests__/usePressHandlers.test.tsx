import { useCallback, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePressHandlers } from '../usePressHandlers';

function DelayedPressTargets() {
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const bindContainer = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);

  usePressHandlers(container, []);

  if (!mounted) {
    return (
      <button type="button" onClick={() => setMounted(true)}>
        Mount card
      </button>
    );
  }

  return (
    <main ref={bindContainer}>
      <span className="cover-target">hidden word</span>
    </main>
  );
}

describe('usePressHandlers', () => {
  it('attaches handlers when the container mounts after the first effect', () => {
    render(<DelayedPressTargets />);

    fireEvent.click(screen.getByText('Mount card'));
    const target = screen.getByText('hidden word');

    fireEvent.mouseDown(target);
    expect(target).toHaveClass('is-pressed');

    fireEvent.mouseUp(window);
    expect(target).not.toHaveClass('is-pressed');
  });
});
