import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PWAInstallIntroCard } from '../PWAInstallIntroCard';

// `simulatedPlatform` builds the plan by hand, so these render the real card
// without having to fake a phone's user agent or viewport.
describe('PWAInstallIntroCard', () => {
  it('offers only the App Store on iOS', () => {
    render(<PWAInstallIntroCard onDismiss={vi.fn()} simulatedPlatform="ios" />);

    const store = screen.getByRole('link', { name: /App Store/i });
    expect(store).toHaveAttribute('href', expect.stringContaining('apps.apple.com'));
    // The whole point of the iOS change: no home-screen path is offered here.
    expect(screen.queryByRole('button', { name: /home screen/i })).not.toBeInTheDocument();
  });

  it('leads with Play on Android and keeps the home screen underneath', () => {
    render(<PWAInstallIntroCard onDismiss={vi.fn()} simulatedPlatform="android" />);

    expect(screen.getByRole('link', { name: /Google Play/i })).toHaveAttribute(
      'href',
      expect.stringContaining('play.google.com'),
    );
    expect(screen.getByRole('button', { name: /home screen/i })).toBeInTheDocument();
  });

  it('can always be dismissed', async () => {
    const onDismiss = vi.fn();
    render(<PWAInstallIntroCard onDismiss={onDismiss} simulatedPlatform="ios" />);

    screen.getByRole('button', { name: /Continue in the browser/i }).click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
