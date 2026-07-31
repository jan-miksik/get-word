import { mobileApiRequest } from './client';

export type MobileIdentity = {
  authenticated: boolean;
  email?: string | null;
  authProvider?: string | null;
  userRole?: 'user' | 'editor' | null;
};

export type MobileSession = {
  success: true;
  userId: string;
  email: string | null;
  authProvider: string | null;
  userRole: 'user' | 'editor';
  sessionToken: string;
};

export function fetchMobileIdentity(sessionToken?: string | null) {
  return mobileApiRequest<MobileIdentity>('/api/auth/me', { sessionToken });
}

export function exchangeSupabaseSession(input: {
  accessToken: string;
  deviceId: string;
  /**
   * Apple's one-time authorization code. The server trades it for a refresh
   * token it can revoke when the account is deleted, which Sign in with Apple
   * requires and the id_token flow alone cannot provide.
   */
  appleAuthorizationCode?: string;
}) {
  return mobileApiRequest<MobileSession>('/api/auth/sync-user', {
    method: 'POST',
    sessionToken: input.accessToken,
    body: {
      client: 'ios',
      deviceId: input.deviceId,
      appleAuthorizationCode: input.appleAuthorizationCode,
    },
  });
}
