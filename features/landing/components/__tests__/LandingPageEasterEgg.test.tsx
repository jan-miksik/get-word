import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from '../LandingPage';

vi.mock('@/components/SpeckledBackground', () => ({
  SpeckledBackground: () => <div data-testid="speckled-background" />,
}));

/**
 * The scratch field is a hidden easter egg: the landing page ships with a
 * static contour background, and only a double-click on the logo brings the
 * interactive version back.
 */
describe('LandingPage scratch-field easter egg', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ languages: [] }) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const logo = (container: HTMLElement) => {
    const target = container.querySelector('.lp-logo-egg');
    if (!target) throw new Error('missing easter-egg target');
    return target;
  };

  const layers = (container: HTMLElement) => container.querySelector('.lp-scratch-layers');

  it('shows only the static background until the logo is double-clicked', () => {
    const { container } = render(<LandingPage />);

    expect(layers(container)).toBeNull();
    expect(container.querySelector('.scratch-field-switcher')).toBeNull();
  });

  it('fades the scratch field in on a double activation of the logo', () => {
    const { container } = render(<LandingPage />);

    fireEvent.pointerUp(logo(container));
    fireEvent.pointerUp(logo(container));

    expect(layers(container)).toHaveClass('lp-scratch-in');
    // The switcher only exists inside the egg, and never fades with it.
    expect(container.querySelector('.scratch-field-switcher')).not.toBeNull();
  });

  it('ignores a single click, and clicks too far apart to be a gesture', () => {
    const { container } = render(<LandingPage />);

    fireEvent.pointerUp(logo(container));
    expect(layers(container)).toBeNull();

    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    fireEvent.pointerUp(logo(container));
    expect(layers(container)).toBeNull();
    now.mockRestore();
  });

  it('toggles back off, unmounting the layers once they have faded out', () => {
    const { container } = render(<LandingPage />);

    fireEvent.pointerUp(logo(container));
    fireEvent.pointerUp(logo(container));
    fireEvent.pointerUp(logo(container));
    fireEvent.pointerUp(logo(container));

    const fadingOut = layers(container);
    expect(fadingOut).toHaveClass('lp-scratch-out');
    // The switcher goes immediately: it is a control, not part of the surface.
    expect(container.querySelector('.scratch-field-switcher')).toBeNull();

    fireEvent.animationEnd(fadingOut as Element);
    expect(layers(container)).toBeNull();
  });

  it('does not persist the egg, so a reload returns to the static background', () => {
    const { container, unmount } = render(<LandingPage />);

    fireEvent.pointerUp(logo(container));
    fireEvent.pointerUp(logo(container));
    expect(layers(container)).not.toBeNull();
    unmount();

    const reloaded = render(<LandingPage />);
    expect(layers(reloaded.container)).toBeNull();
  });
});
