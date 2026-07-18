const PHOTO_LAB_STORAGE_KEY = 'get-word-photo-lab-enabled';

export function readPhotoLabPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PHOTO_LAB_STORAGE_KEY) === 'true';
  } catch {
    return false;
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
