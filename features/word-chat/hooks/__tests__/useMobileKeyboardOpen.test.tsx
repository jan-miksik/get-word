import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMobileKeyboardOpen } from '../useMobileKeyboardOpen';

function stubViewportWidth(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile && query === '(max-width: 767px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

function Probe({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const open = useMobileKeyboardOpen(ref, enabled);
  return (
    <div ref={ref}>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <input aria-label="message" />
      <input aria-label="other" />
      <button type="button">send</button>
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMobileKeyboardOpen', () => {
  it('reports the keyboard while a text field on a phone holds focus', () => {
    stubViewportWidth(true);
    render(<Probe />);

    const field = screen.getByLabelText('message');
    fireEvent.focusIn(field);
    // jsdom does not move focus on a synthetic event, so drive it directly.
    field.focus();
    fireEvent.focusIn(field);
    expect(screen.getByTestId('state')).toHaveTextContent('open');

    fireEvent.focusOut(field, { relatedTarget: screen.getByRole('button') });
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('stays open while focus moves between two fields', () => {
    stubViewportWidth(true);
    render(<Probe />);

    const field = screen.getByLabelText('message');
    const other = screen.getByLabelText('other');
    field.focus();
    fireEvent.focusIn(field);
    fireEvent.focusOut(field, { relatedTarget: other });

    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });

  it('never reports a keyboard on a wide viewport', () => {
    stubViewportWidth(false);
    render(<Probe />);

    const field = screen.getByLabelText('message');
    field.focus();
    fireEvent.focusIn(field);

    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('reports nothing while the surface is not the visible one', () => {
    stubViewportWidth(true);
    render(<Probe enabled={false} />);

    const field = screen.getByLabelText('message');
    field.focus();
    fireEvent.focusIn(field);

    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });
});
