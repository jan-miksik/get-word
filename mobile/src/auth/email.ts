import type { SupabaseClient } from '@supabase/supabase-js';
import { exchangeSupabaseSession, type MobileSession } from '../api/auth';
import { getOrCreateDeviceId, storeAppSessionToken } from './secure-session';
import { getMobileSupabaseClient } from './supabase';

export const REVIEW_ACCOUNT_EMAIL = 'play-review@getword.app';

export function isReviewAccountEmail(email: string): boolean {
  return email.trim().toLowerCase() === REVIEW_ACCOUNT_EMAIL;
}

function normalizedEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!value) throw new Error('Zadej e-mailovou adresu.');
  return value;
}

async function exchangeAndStoreSession(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<MobileSession> {
  try {
    const appSession = await exchangeSupabaseSession({
      accessToken,
      deviceId: await getOrCreateDeviceId(),
    });
    await storeAppSessionToken(appSession.sessionToken);
    return appSession;
  } finally {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

/** Send the same passwordless email code that the web app uses. */
export async function requestEmailSignInCode(email: string): Promise<void> {
  const supabase = getMobileSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail(email),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Verify an email code, then replace the temporary Supabase session with ours. */
export async function signInWithEmailCode(
  email: string,
  code: string,
): Promise<MobileSession> {
  const token = code.trim();
  if (!token) throw new Error('Zadej kód z e-mailu.');

  const supabase = getMobileSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizedEmail(email),
    token,
    type: 'email',
  });
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error('Supabase nevytvořil přihlašovací relaci.');
  }
  return exchangeAndStoreSession(supabase, data.session.access_token);
}

/**
 * Password sign-in exists only for the reusable App Review account. The
 * password is supplied through App Store Connect and is never in the binary.
 */
export async function signInReviewAccountWithPassword(
  email: string,
  password: string,
): Promise<MobileSession> {
  if (!isReviewAccountEmail(email)) {
    throw new Error('Tento účet používá přihlášení kódem.');
  }
  if (!password) throw new Error('Enter the review password.');

  const supabase = getMobileSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: REVIEW_ACCOUNT_EMAIL,
    password,
  });
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error('Supabase did not create a reviewer session.');
  }
  return exchangeAndStoreSession(supabase, data.session.access_token);
}
