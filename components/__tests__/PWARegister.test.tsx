import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWARegister } from '../PWARegister';

const originalNodeEnv = process.env.NODE_ENV;
const originalAppVersion = process.env.NEXT_PUBLIC_APP_VERSION;

describe('PWARegister', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_APP_VERSION = originalAppVersion;
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('unregisters lingering service workers and clears Wordlink caches in development', async () => {
    process.env.NODE_ENV = 'development';

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
          'wordlink-static-old',
          'wordlink-runtime-old',
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
      expect(cacheDelete).toHaveBeenCalledWith('wordlink-static-old');
      expect(cacheDelete).toHaveBeenCalledWith('wordlink-runtime-old');
      expect(cacheDelete).not.toHaveBeenCalledWith('unrelated-cache');
    });

    expect(warn).toHaveBeenCalledWith(
      '[PWA] A stale service worker was controlling this dev page. It has been unregistered and Wordlink caches were cleared. Reload once if the UI still looks old.',
    );
    expect(
      await screen.findByText('Stale service worker detected in dev')
    ).toBeInTheDocument();
    expect(document.body.textContent).toContain('Wordlink cleared 2 caches');
    expect(register).not.toHaveBeenCalled();
  });

  it('stays invisible in development when no service worker controls the page', async () => {
    process.env.NODE_ENV = 'development';

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
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_VERSION = '1.0.123';

    const waitingWorker = { postMessage: vi.fn() };
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
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
      });
    });

    expect(addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });
  });
});
