'use client';

const STORAGE_KEY = 'get-word-address-register';
export const ADDRESS_REGISTER_CHANGED_EVENT = 'get-word-address-register-changed';

export type AddressRegister = 'casual' | 'formal';

export function readAddressRegisterPreference(): AddressRegister | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'casual' || value === 'formal' ? value : null;
  } catch {
    return null;
  }
}

export function storeAddressRegisterPreference(
  value: AddressRegister,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new Event(ADDRESS_REGISTER_CHANGED_EVENT));
  } catch {
    // The server remains authoritative; this cache only personalizes local UI.
  }
}
