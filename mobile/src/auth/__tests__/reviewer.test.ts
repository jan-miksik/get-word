import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  signInWithPassword,
  signOut,
  exchangeSupabaseSession,
  getOrCreateDeviceId,
  storeAppSessionToken,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  exchangeSupabaseSession: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
  storeAppSessionToken: vi.fn(),
}));

vi.mock('../supabase', () => ({
  getMobileSupabaseClient: () => ({
    auth: { signInWithPassword, signOut },
  }),
}));

vi.mock('../../api/auth', () => ({ exchangeSupabaseSession }));

vi.mock('../secure-session', () => ({
  getOrCreateDeviceId,
  storeAppSessionToken,
}));

import { signInReviewerAccount } from '../reviewer';

describe('signInReviewerAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrCreateDeviceId.mockResolvedValue('device-1');
    signOut.mockResolvedValue(undefined);
  });

  it('exchanges the password-authenticated Supabase token for a Keychain session', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'supabase-token' } },
      error: null,
    });
    exchangeSupabaseSession.mockResolvedValue({
      success: true,
      userId: 'user-1',
      email: 'play-review@getword.app',
      authProvider: 'email',
      userRole: 'user',
      sessionToken: 'get-word-token',
    });

    const result = await signInReviewerAccount(
      '  play-review@getword.app  ',
      'secret',
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'play-review@getword.app',
      password: 'secret',
    });
    expect(exchangeSupabaseSession).toHaveBeenCalledWith({
      accessToken: 'supabase-token',
      deviceId: 'device-1',
    });
    expect(storeAppSessionToken).toHaveBeenCalledWith('get-word-token');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result.sessionToken).toBe('get-word-token');
  });

  it('does not contact Supabase without both credentials', async () => {
    await expect(signInReviewerAccount('', '')).rejects.toThrow(
      'Enter the review email and password.',
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
