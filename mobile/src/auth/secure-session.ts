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

export async function readAppSessionToken(): Promise<string | null> {
  if (!isNativeApp()) return sessionStorage.getItem(APP_SESSION_KEY);
  await configureNativeStorage();
  return SecureStorage.getItem(APP_SESSION_KEY);
}

export async function storeAppSessionToken(token: string): Promise<void> {
  if (!isNativeApp()) {
    sessionStorage.setItem(APP_SESSION_KEY, token);
    return;
  }
  await configureNativeStorage();
  await SecureStorage.set(
    APP_SESSION_KEY,
    token,
    true,
    false,
    KeychainAccess.whenUnlockedThisDeviceOnly,
  );
}

export async function clearAppSessionToken(): Promise<void> {
  if (!isNativeApp()) {
    sessionStorage.removeItem(APP_SESSION_KEY);
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

  await configureNativeStorage();
  const existing = await SecureStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  await SecureStorage.set(
    DEVICE_ID_KEY,
    created,
    true,
    false,
    KeychainAccess.whenUnlockedThisDeviceOnly,
  );
  return created;
}
