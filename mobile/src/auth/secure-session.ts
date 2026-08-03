import {
  KeychainAccess,
  SecureStorage,
} from '@aparajita/capacitor-secure-storage';
import { isNativeApp } from '../native';

const APP_SESSION_KEY = 'session-token';
const DEVICE_ID_KEY = 'device-id';
const STORAGE_PREFIX = 'app.getword.';

let nativeStorageSetup: Promise<void> | null = null;

function configureNativeStorage(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  if (!nativeStorageSetup) {
    nativeStorageSetup = (async () => {
      await SecureStorage.setSynchronize(false);
      await SecureStorage.setKeyPrefix(STORAGE_PREFIX);
      await SecureStorage.setDefaultKeychainAccess(
        KeychainAccess.whenUnlockedThisDeviceOnly,
      );
    })();
  }
  return nativeStorageSetup;
}

/**
 * `SecureStorage.set()` stores `JSON.stringify(value)`, so it must be paired
 * with `get()`, which parses it back. Reading the same key with `getItem()`
 * returns the raw keychain string — a token still wrapped in quotes, which the
 * API rejects. Every read here goes through this helper for that reason.
 */
async function readSecureString(key: string): Promise<string | null> {
  await configureNativeStorage();
  try {
    const value = await SecureStorage.get(key, false);
    return typeof value === 'string' ? value : null;
  } catch {
    // Unreadable/corrupt entry: treat it as absent rather than failing boot.
    return null;
  }
}

async function writeSecureString(key: string, value: string): Promise<void> {
  await configureNativeStorage();
  await SecureStorage.set(
    key,
    value,
    false,
    false,
    KeychainAccess.whenUnlockedThisDeviceOnly,
  );
}

export async function readAppSessionToken(): Promise<string | null> {
  if (!isNativeApp()) return localStorage.getItem(APP_SESSION_KEY);
  return readSecureString(APP_SESSION_KEY);
}

export async function storeAppSessionToken(token: string): Promise<void> {
  if (!isNativeApp()) {
    localStorage.setItem(APP_SESSION_KEY, token);
    return;
  }
  await writeSecureString(APP_SESSION_KEY, token);
}

export async function clearAppSessionToken(): Promise<void> {
  if (!isNativeApp()) {
    localStorage.removeItem(APP_SESSION_KEY);
    return;
  }
  await configureNativeStorage();
  await SecureStorage.remove(APP_SESSION_KEY);
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (!isNativeApp()) {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  }

  const existing = await readSecureString(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  await writeSecureString(DEVICE_ID_KEY, created);
  return created;
}
