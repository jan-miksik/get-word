import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWARegister } from '../PWARegister';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('PWARegister', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('unregisters lingering service workers and clears Get Word caches in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([
      { unregister: unregisterA },
      { unregister: unregisterB },
    ]);
    const register = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations,
        register,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });

    const cacheDelete = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue([
          'get-word-static-old',
          'get-word-runtime-old',
          'unrelated-cache',
        ]),
        delete: cacheDelete,
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(getRegistrations).toHaveBeenCalledTimes(1);
      expect(unregisterA).toHaveBeenCalledTimes(1);
      expect(unregisterB).toHaveBeenCalledTimes(1);
      expect(cacheDelete).toHaveBeenCalledWith('get-word-static-old');
      expect(cacheDelete).toHaveBeenCalledWith('get-word-runtime-old');
      expect(cacheDelete).not.toHaveBeenCalledWith('unrelated-cache');
    });

    expect(warn).toHaveBeenCalledWith(
      '[PWA] A stale service worker was controlling this dev page. It has been unregistered and Get Word caches were cleared. Reload once if the UI still looks old.',
    );
    expect(
      await screen.findByText('Stale service worker detected in dev')
    ).toBeInTheDocument();
    expect(document.body.textContent).toContain('Get Word cleared 2 caches');
    expect(register).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss stale service worker notice' }),
    );

    expect(screen.queryByText('Stale service worker detected in dev')).not.toBeInTheDocument();
  });

  it('stays invisible in development when no service worker controls the page', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([]),
        register: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: null,
      },
    });

    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(navigator.serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
    });

    expect(document.body.textContent).not.toContain('Stale service worker detected in dev');
  });

  it('registers the production service worker with a build-specific URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');

    const waitingWorker = { postMessage: vi.fn() };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const register = vi.fn().mockResolvedValue(registration);
    const swAddEventListener = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistrations: vi.fn(),
        addEventListener: swAddEventListener,
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js?build=1.0.123', {
        scope: '/',
        updateViaCache: 'none',
      });
    });

    // A waiting update is armed for the next foreground return, not applied now.
    expect(swAddEventListener).not.toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('silently activates a waiting worker when the refreshed page already has the new build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.124');
    window.localStorage.setItem('get-word-landing-lang', 'en');
    window.localStorage.setItem('get-word-pwa-app-version', '1.0.123');

    const waitingWorker = { postMessage: vi.fn() };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const register = vi.fn().mockResolvedValue(registration);
    const swAddEventListener = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistrations: vi.fn(),
        addEventListener: swAddEventListener,
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js?build=1.0.124', {
        scope: '/',
        updateViaCache: 'none',
      });
    });

    // Already on the new build, so activate immediately without a reload.
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(swAddEventListener).not.toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('get-word-pwa-app-version')).toBe('1.0.124');
  });

  it('applies a waiting update silently when the app returns to the foreground', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    // Same stored build: the page is still running the old bundle in this tab.
    window.localStorage.setItem('get-word-pwa-app-version', '1.0.123');

    const waitingWorker = { postMessage: vi.fn() };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const register = vi.fn().mockResolvedValue(registration);
    const swAddEventListener = vi.fn();
    const docAddEventListener = vi.spyOn(document, 'addEventListener');

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistrations: vi.fn(),
        addEventListener: swAddEventListener,
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(docAddEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    // Nothing happens while the app stays in view.
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();

    // Leaving does not apply it either.
    setVisibility('hidden');
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();

    // Returning to the foreground applies the update and reloads on takeover.
    setVisibility('visible');
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(swAddEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('checks the deployed version on app foreground and registers the newer worker URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    // Same stored build: the open tab has not loaded the new client bundle yet.
    window.localStorage.setItem('get-word-pwa-app-version', '1.0.123');
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '1.0.124' }),
    });
    vi.stubGlobal('fetch', fetch);

    const waitingWorker = { postMessage: vi.fn() };
    const oldRegistration = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const newRegistration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const register = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(url.includes('1.0.124') ? newRegistration : oldRegistration)
    );
    const swAddEventListener = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistrations: vi.fn(),
        addEventListener: swAddEventListener,
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(oldRegistration.update).toHaveBeenCalledTimes(1);
    });

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/version\?pwa-check=/),
        { cache: 'no-store' }
      );
      expect(register).toHaveBeenCalledWith('/sw.js?build=1.0.124', {
        scope: '/',
        updateViaCache: 'none',
      });
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });
    expect(swAddEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('falls back to registration.update when the deployed version check fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    window.localStorage.setItem('get-word-pwa-app-version', '1.0.123');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const waitingWorker = { postMessage: vi.fn() };
    let updateCalls = 0;
    const registration: {
      waiting: null | typeof waitingWorker;
      installing: null;
      addEventListener: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    } = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockImplementation(() => {
        updateCalls += 1;
        if (updateCalls === 2) {
          registration.waiting = waitingWorker;
        }
        return Promise.resolve();
      }),
    };
    const register = vi.fn().mockResolvedValue(registration);
    const swAddEventListener = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistrations: vi.fn(),
        addEventListener: swAddEventListener,
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalledTimes(2);
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });
    expect(swAddEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
  });

  it('does not apply an update on a first, uncontrolled install', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');

    const waitingWorker = { postMessage: vi.fn() };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const register = vi.fn().mockResolvedValue(registration);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistrations: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        // No controller: this is the page's first, passive install.
        controller: null,
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(register).toHaveBeenCalled();
    });

    expect(waitingWorker.postMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('renders the refresh-banner design preview when requested', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    window.localStorage.setItem('get-word-landing-lang', 'en');
    window.history.replaceState({}, '', '/?pwaBanner=1');

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue({
          waiting: null,
          installing: null,
          addEventListener: vi.fn(),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        getRegistrations: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: null,
      },
    });

    render(<PWARegister />);

    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    expect(
      screen.getByText('A new version of Get Word is ready.')
    ).toBeInTheDocument();

    // The preview button just dismisses; there is no worker behind it.
    fireEvent.click(refreshButton);
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();

    window.history.replaceState({}, '', '/');
  });
});
