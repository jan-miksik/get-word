export function readPhotoLabPreference(): boolean {
  // Photo Lab is a permanent app surface. Do not let the retired beta flag
  // hide it for existing PWA installs that still have `false` in localStorage.
  return true;
}

export function storePhotoLabPreference(_enabled: boolean): void {
  // Compatibility no-op for the learning preferences facade. The feature no
  // longer has a user-controlled preference.
}
