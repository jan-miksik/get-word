import { exchangeSupabaseSession, type MobileSession } from '../api/auth';
import { getOrCreateDeviceId, storeAppSessionToken } from './secure-session';
import { getMobileSupabaseClient } from './supabase';

/**
 * Password sign-in for the reusable App Review account. No credential is
 * embedded in the binary: App Review receives both values through App Store
 * Connect and enters them on the native sign-in screen.
 */
export async function signInReviewerAccount(
  email: string,
  password: string,
): Promise<MobileSession> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) {
    throw new Error('Enter the review email and password.');
  }

  const supabase = getMobileSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error('Supabase did not create a reviewer session.');
  }

  const appSession = await exchangeSupabaseSession({
    accessToken: data.session.access_token,
    deviceId: await getOrCreateDeviceId(),
  });
  await storeAppSessionToken(appSession.sessionToken);

  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  return appSession;
}
