import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  deleteDeviceId: vi.fn(),
  clearLearningCache: vi.fn(),
  clearPendingSync: vi.fn(),
  resetSyncIdentity: vi.fn(),
  assign: vi.fn(),
}));

vi.mock('@/features/shared/http/api-runtime', () => ({
  apiFetch: mocks.apiFetch,
}));
vi.mock('@/lib/device-id', () => ({
  deleteDeviceId: mocks.deleteDeviceId,
  getDeviceId: () => 'device-1',
}));
vi.mock('@/lib/local-learning-cache', () => ({
  clearLearningCache: mocks.clearLearningCache,
}));
vi.mock('@/lib/sync', () => ({
  clearPendingSync: mocks.clearPendingSync,
  resetSyncIdentity: mocks.resetSyncIdentity,
}));
vi.mock('@/features/auth/supabase/env', () => ({
  isSupabaseConfigured: () => false,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { configureSignOutHandler } from '../sign-out-runtime';
import { useAuth } from '../useAuth';

describe('useAuth signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, email: 'a@b.c' }),
    });
    mocks.clearLearningCache.mockResolvedValue(undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: mocks.assign, href: 'https://getword.app/' },
    });
  });

  afterEach(() => {
    configureSignOutHandler(null);
  });

  it('reloads the public home on the web', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthLoading).toBe(false));

    await act(() => result.current.signOut());

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mocks.assign).toHaveBeenCalledWith('/');
  });

  it('hands the last step to the shell instead of reloading', async () => {
    // The native client's session is a Keychain token: a reload would restore
    // it and the account would look signed in again.
    const shellSignOut = vi.fn();
    configureSignOutHandler(shellSignOut);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthLoading).toBe(false));

    await act(() => result.current.signOut());

    expect(shellSignOut).toHaveBeenCalledTimes(1);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
