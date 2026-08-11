'use client';

const STORAGE_KEY = 'get-word-salutation-gender';
const SALUTATION_GENDER_CHANGED_EVENT = 'get-word-salutation-gender-changed';

export type SalutationGender = 'female' | 'male' | 'neutral';

function isSalutationGender(value: unknown): value is SalutationGender {
  return value === 'female' || value === 'male' || value === 'neutral';
}

export function readSalutationGenderPreference(): SalutationGender | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isSalutationGender(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeSalutationGenderPreference(value: SalutationGender): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new Event(SALUTATION_GENDER_CHANGED_EVENT));
  } catch {
    // The server remains authoritative; this cache only personalizes local UI.
  }
}
