const PHOTO_LAB_STORAGE_KEY = 'get-word-photo-lab-enabled';

export function readPhotoLabPreference(): boolean {
  // Photo Lab now lives in the main menu and no longer
  // has a settings toggle, so it is on by default. Only an explicit stored
  // 'false' (from an early tester who turned it off) keeps it hidden.
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PHOTO_LAB_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function storePhotoLabPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PHOTO_LAB_STORAGE_KEY, String(enabled));
  } catch {
    // Keep the in-memory setting usable when storage is unavailable.
  }
}
