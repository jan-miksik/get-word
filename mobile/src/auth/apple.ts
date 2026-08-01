import {
  AppleSignIn,
  ErrorCode,
  SignInScope,
} from '@capawesome/capacitor-apple-sign-in';
import { exchangeSupabaseSession, type MobileSession } from '../api/auth';
import { isNativeApp } from '../native';
import { getOrCreateDeviceId, storeAppSessionToken } from './secure-session';
import { getMobileSupabaseClient } from './supabase';

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function isCanceledAppleSignIn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  return code === ErrorCode.SignInCanceled || code === '1001';
}

export async function signInWithApple(): Promise<MobileSession | null> {
  if (!isNativeApp()) {
    throw new Error('Apple přihlášení je dostupné v nativní iOS aplikaci.');
  }

  const rawNonce = createNonce();
  const appleNonce = await sha256Hex(rawNonce);

  try {
    const credential = await AppleSignIn.signIn({
      nonce: appleNonce,
      // The app identifies and displays accounts by email. Do not request or
      // retain a person's name when the product does not use it.
      scopes: [SignInScope.Email],
    });
    if (!credential.idToken) {
      throw new Error('Apple neposkytl ověřovací token. Zkus to prosím znovu.');
    }

    const supabase = getMobileSupabaseClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.idToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    if (!data.session?.access_token) {
      throw new Error('Supabase nevytvořil přihlašovací relaci.');
    }

    // Verify the freshly issued token against the same Supabase project before
    // sending it to our backend. This makes a project/key mismatch visible at
    // the correct boundary instead of surfacing as a generic backend 401.
    const { data: verified, error: verificationError } =
      await supabase.auth.getUser(data.session.access_token);
    if (verificationError || !verified.user) {
      throw new Error(
        `Supabase token self-check failed: ${verificationError?.message ?? 'missing user'}`,
      );
    }

    // Exchange the exact token we just verified before any optional profile
    // update can rotate or replace the Supabase session.
    const appSession = await exchangeSupabaseSession({
      accessToken: data.session.access_token,
      deviceId: await getOrCreateDeviceId(),
      appleAuthorizationCode: credential.authorizationCode,
    });
    await storeAppSessionToken(appSession.sessionToken);

    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return appSession;
  } catch (error) {
    if (isCanceledAppleSignIn(error)) return null;
    throw error;
  }
}
