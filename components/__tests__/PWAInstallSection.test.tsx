import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWAInstallSection } from '@/components/PWAInstallSection';
import {
  clearCapturedBeforeInstallPrompt,
  installGlobalPWACapture,
} from '@/lib/pwa-install';

function dispatchBeforeInstallPrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: typeof prompt;
    userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
  };
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

  window.dispatchEvent(event);

  return { prompt };
}

// The section is mobile-only now: `useAppInstallPlan` returns null on a desktop
// viewport, so the install offer is never rendered there. jsdom's own user agent
// is neither iOS nor Android, which puts these on the no-store branch — the one
// case where Settings still fires the browser prompt itself.
function stubMobileViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('PWAInstallSection', () => {
  beforeEach(() => {
    clearCapturedBeforeInstallPrompt();
    stubMobileViewport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers nothing to install on a desktop viewport', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    installGlobalPWACapture();
    dispatchBeforeInstallPrompt();

    render(<PWAInstallSection />);

    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    expect(screen.getByText(/Use your browser menu/i)).toBeInTheDocument();
  });

  it('uses a globally captured install prompt when settings opens after the browser event', async () => {
    installGlobalPWACapture();
    const { prompt } = dispatchBeforeInstallPrompt();

    render(<PWAInstallSection />);

    const installButton = await screen.findByRole('button', { name: 'Install' });
    expect(screen.queryByText(/Use your browser menu/i)).not.toBeInTheDocument();

    await userEvent.click(installButton);

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });
});
