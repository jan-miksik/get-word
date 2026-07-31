import { mobileApiRequest } from './client';

export type MobileIdentity = {
  authenticated: boolean;
  email?: string | null;
  authProvider?: string | null;
  userRole?: 'user' | 'editor' | null;
};

type MobileSessionResponse = {
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
}) {
  return mobileApiRequest<MobileSessionResponse>('/api/auth/sync-user', {
    method: 'POST',
    sessionToken: input.accessToken,
    body: {
      client: 'ios',
      deviceId: input.deviceId,
    },
  });
}
