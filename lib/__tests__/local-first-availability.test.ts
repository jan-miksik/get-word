import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureLocalFirstAvailability,
  isLocalFirstAvailableSync,
  resetLocalFirstAvailability,
} from '../local-first/availability';

beforeEach(() => {
  resetLocalFirstAvailability();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'indexedDB');
  resetLocalFirstAvailability();
});

describe('local-first availability probe', () => {
  it('reports false when IndexedDB is absent', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
    const ok = await ensureLocalFirstAvailability();
    expect(ok).toBe(false);
    expect(isLocalFirstAvailableSync()).toBe(false);
  });

  it('reports false when indexedDB.open throws', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          throw new Error('blocked');
        },
      },
    });
    const ok = await ensureLocalFirstAvailability();
    expect(ok).toBe(false);
  });

  it('reports false when the open request errors', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          const req = {} as IDBOpenDBRequest;
          queueMicrotask(() => req.onerror?.call(req, new Event('error')));
          return req;
        },
      },
    });
    const ok = await ensureLocalFirstAvailability();
    expect(ok).toBe(false);
  });

  it('memoizes the probe result for the TTL window', async () => {
    const openSpy = vi.fn(() => {
      const req = {} as IDBOpenDBRequest;
      queueMicrotask(() => req.onerror?.call(req, new Event('error')));
      return req;
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: openSpy },
    });
    await ensureLocalFirstAvailability();
    await ensureLocalFirstAvailability();
    await ensureLocalFirstAvailability();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
