import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWARegister } from '../PWARegister';

describe('PWARegister', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(navigator, 'serviceWorker');
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
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
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
        addEventListener,
        removeEventListener,
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

    expect(addEventListener).not.toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('does not clear caches or reload the page when the build version changes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.124');
    window.localStorage.setItem('get-word-pwa-app-version', '1.0.123');

    const registration = {
      waiting: { postMessage: vi.fn() },
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
        controller: { state: 'activated' },
      },
    });

    const cacheDelete = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['get-word-static-1.0.123']),
        delete: cacheDelete,
      },
    });

    render(<PWARegister />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js?build=1.0.124', {
        scope: '/',
        updateViaCache: 'none',
      });
    });

    expect(cacheDelete).not.toHaveBeenCalled();
    expect(registration.waiting.postMessage).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('get-word-pwa-app-version')).toBe('1.0.124');
  });

  it('shows a refresh banner for a waiting worker and activates it on click', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    vi.stubEnv('NEXT_PUBLIC_PWA_REFRESH_AFTER_DAYS', '0');
    window.localStorage.setItem('get-word-landing-lang', 'en');

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
        // An old worker controls the page, so the waiting worker is an update.
        controller: { state: 'activated' },
      },
    });

    render(<PWARegister />);

    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    expect(
      screen.getByText('A new version of Get Word is ready.')
    ).toBeInTheDocument();

    fireEvent.click(refreshButton);

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(swAddEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
  });

  it('does not show the refresh banner on a first, uncontrolled install', async () => {
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

    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  const waitingRegistration = () => {
    const registration = {
      waiting: { postMessage: vi.fn() },
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(registration),
        getRegistrations: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: { state: 'activated' },
      },
    });
    return registration;
  };

  it('defers the banner until a waiting update has aged past the delay', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    window.localStorage.setItem('get-word-landing-lang', 'en');

    const registration = waitingRegistration();

    render(<PWARegister />);

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalled();
    });

    // First time the update is seen: banner stays hidden, clock starts.
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('get-word-pwa-update-seen-at')).not.toBeNull();
  });

  it('shows the banner once the update has been waiting longer than the delay', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    window.localStorage.setItem('get-word-landing-lang', 'en');
    // Seen four days ago, past the default 3-day delay.
    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem('get-word-pwa-update-seen-at', String(fourDaysAgo));

    waitingRegistration();

    render(<PWARegister />);

    expect(
      await screen.findByRole('button', { name: 'Refresh' })
    ).toBeInTheDocument();
  });

  it('skips the delay and shows the banner immediately for an urgent refresh', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.123');
    vi.stubEnv('NEXT_PUBLIC_PWA_REFRESH_URGENT', 'true');
    window.localStorage.setItem('get-word-landing-lang', 'en');

    waitingRegistration();

    render(<PWARegister />);

    // No prior "seen at" timestamp, yet the banner appears right away.
    expect(
      await screen.findByRole('button', { name: 'Refresh' })
    ).toBeInTheDocument();
  });
});
