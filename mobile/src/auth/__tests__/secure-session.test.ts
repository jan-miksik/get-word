import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fake keychain that mirrors the plugin's real encoding: `set()` stores
 * `JSON.stringify(value)`, `get()` parses it back, and `getItem()` returns the
 * raw stored string. A read that does not match its write therefore returns a
 * quoted value here, exactly as it did on the device.
 */
const { store, isNativeApp } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  isNativeApp: vi.fn(),
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: {
    setSynchronize: vi.fn().mockResolvedValue(undefined),
    setKeyPrefix: vi.fn().mockResolvedValue(undefined),
    setDefaultKeychainAccess: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(async (key: string, data: unknown) => {
      store.set(key, JSON.stringify(data));
    }),
    get: vi.fn(async (key: string) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return JSON.parse(raw) as unknown;
    }),
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    remove: vi.fn(async (key: string) => store.delete(key)),
  },
}));

vi.mock('../../native', () => ({ isNativeApp }));

import {
  clearAppSessionToken,
  getOrCreateDeviceId,
  readAppSessionToken,
  storeAppSessionToken,
} from '../secure-session';

describe('native secure session storage', () => {
  beforeEach(() => {
    store.clear();
    isNativeApp.mockReturnValue(true);
  });

  it('reads back the exact session token it stored', async () => {
    await storeAppSessionToken('payload.signature');

    expect(await readAppSessionToken()).toBe('payload.signature');
  });

  it('reports no session before anything is stored', async () => {
    expect(await readAppSessionToken()).toBeNull();
  });

  it('forgets the session token when it is cleared', async () => {
    await storeAppSessionToken('payload.signature');
    await clearAppSessionToken();

    expect(await readAppSessionToken()).toBeNull();
  });

  it('keeps the same device id across restarts', async () => {
    const first = await getOrCreateDeviceId();
    const second = await getOrCreateDeviceId();

    expect(second).toBe(first);
  });
});
