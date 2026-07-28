import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADDRESS_REGISTER_CHANGED_EVENT,
  readAddressRegisterPreference,
  storeAddressRegisterPreference,
} from '../address-register';

describe('address-register preference cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('stores a valid choice and notifies same-tab listeners', () => {
    const listener = vi.fn();
    window.addEventListener(ADDRESS_REGISTER_CHANGED_EVENT, listener);

    storeAddressRegisterPreference('casual');

    expect(readAddressRegisterPreference()).toBe('casual');
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(ADDRESS_REGISTER_CHANGED_EVENT, listener);
  });

  it('ignores unknown persisted values', () => {
    window.localStorage.setItem('get-word-address-register', 'unknown');
    expect(readAddressRegisterPreference()).toBeNull();
  });
});
