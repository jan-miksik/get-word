export const PUBLIC_LANGUAGE_STORAGE_KEY = 'get-word-landing-lang';

// Wall-clock timestamp of the last explicit UI-language choice on this device.
// Paired with PUBLIC_LANGUAGE_STORAGE_KEY so a freshly-saved local choice can win
// a last-write-wins comparison against the server's settings_language_selected_at
// (see useSettingsLanguage). Otherwise a route that re-fetches the server value
// (e.g. Photo Lab) would show a stale language until the mutation is synced.
export const PUBLIC_LANGUAGE_SELECTED_AT_STORAGE_KEY = 'get-word-landing-lang-selected-at';

/** Persist an explicit UI-language choice together with the moment it was made. */
export function writePreferredPublicLanguage(normalized: string): void {
  try {
    localStorage.setItem(PUBLIC_LANGUAGE_STORAGE_KEY, normalized);
    localStorage.setItem(PUBLIC_LANGUAGE_SELECTED_AT_STORAGE_KEY, new Date().toISOString());
  } catch {
    // Storage can be unavailable (private mode); the in-memory choice still applies.
  }
}

/** ISO timestamp of the last explicit local choice, or null if never set here. */
export function readPreferredPublicLanguageSelectedAt(): string | null {
  try {
    return localStorage.getItem(PUBLIC_LANGUAGE_SELECTED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}
