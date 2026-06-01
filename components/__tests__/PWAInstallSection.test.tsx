import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('PWAInstallSection', () => {
  beforeEach(() => {
    clearCapturedBeforeInstallPrompt();
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
