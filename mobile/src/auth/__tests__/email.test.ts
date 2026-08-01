import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  signInWithOtp,
  verifyOtp,
  signInWithPassword,
  signOut,
  exchangeSupabaseSession,
  getOrCreateDeviceId,
  storeAppSessionToken,
} = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  exchangeSupabaseSession: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
  storeAppSessionToken: vi.fn(),
}));

vi.mock('../supabase', () => ({
  getMobileSupabaseClient: () => ({
    auth: { signInWithOtp, verifyOtp, signInWithPassword, signOut },
  }),
}));

vi.mock('../../api/auth', () => ({ exchangeSupabaseSession }));

vi.mock('../secure-session', () => ({
  getOrCreateDeviceId,
  storeAppSessionToken,
}));

import {
  isReviewAccountEmail,
  requestEmailSignInCode,
  signInReviewAccountWithPassword,
  signInWithEmailCode,
} from '../email';

const mobileSession = {
  success: true as const,
  userId: 'user-1',
  email: 'learner@example.com',
  authProvider: 'email',
  userRole: 'user' as const,
  sessionToken: 'get-word-token',
};

describe('native email sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrCreateDeviceId.mockResolvedValue('device-1');
    signOut.mockResolvedValue(undefined);
    exchangeSupabaseSession.mockResolvedValue(mobileSession);
  });

  it('sends a passwordless code to a normalized email address', async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    await requestEmailSignInCode('  Learner@Example.com  ');

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('verifies an email code and stores the exchanged Get Word session', async () => {
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: 'supabase-token' } },
      error: null,
    });

    const result = await signInWithEmailCode('learner@example.com', ' 12345678 ');

    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      token: '12345678',
      type: 'email',
    });
    expect(exchangeSupabaseSession).toHaveBeenCalledWith({
      accessToken: 'supabase-token',
      deviceId: 'device-1',
    });
    expect(storeAppSessionToken).toHaveBeenCalledWith('get-word-token');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result).toBe(mobileSession);
  });

  it('uses a password only for the documented App Review address', async () => {
    expect(isReviewAccountEmail(' PLAY-REVIEW@getword.app ')).toBe(true);
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'review-token' } },
      error: null,
    });

    await signInReviewAccountWithPassword('play-review@getword.app', 'secret');

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'play-review@getword.app',
      password: 'secret',
    });
  });

  it('does not expose password sign-in to ordinary email addresses', async () => {
    await expect(
      signInReviewAccountWithPassword('learner@example.com', 'secret'),
    ).rejects.toThrow('Tento účet používá přihlášení kódem.');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
