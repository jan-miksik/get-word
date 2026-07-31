import { getOrCreateDeviceId } from './auth/secure-session';

/**
 * The shared app reads its device id from `localStorage` (`lib/device-id.ts`).
 * The native client keeps the authoritative id in the Keychain, so the two are
 * reconciled once at boot — before any shared module reads it — instead of
 * teaching every caller about the native storage.
 */
const SHARED_DEVICE_ID_KEY = 'get_word_device_id';

export async function adoptNativeDeviceId(): Promise<string> {
  const deviceId = await getOrCreateDeviceId();
  try {
    localStorage.setItem(SHARED_DEVICE_ID_KEY, deviceId);
  } catch {
    // Web storage can be unavailable; the shared helper falls back to an
    // in-memory id and the session still authenticates by bearer token.
  }
  return deviceId;
}
