import {
  AppleSignIn,
  ErrorCode,
  SignInScope,
} from '@capawesome/capacitor-apple-sign-in';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { exchangeSupabaseSession, type MobileSession } from '../api/auth';
import {
  hasMobileAuthConfiguration,
  supabasePublishableKey,
  supabaseUrl,
} from '../config';
import { isNativeApp } from '../native';
import { getOrCreateDeviceId, storeAppSessionToken } from './secure-session';

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!hasMobileAuthConfiguration()) {
    throw new Error('Mobilní přihlášení zatím nemá nastavené připojení k Supabase.');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

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
      scopes: [SignInScope.Email, SignInScope.FullName],
    });
    if (!credential.idToken) {
      throw new Error('Apple neposkytl ověřovací token. Zkus to prosím znovu.');
    }

    const supabase = getSupabaseClient();
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

    // Apple returns the name only on the first authorization. Updating this
    // optional metadata must not block persistence of the app session.
    if (credential.givenName || credential.familyName) {
      const fullName = [credential.givenName, credential.familyName]
        .filter(Boolean)
        .join(' ');
      await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          given_name: credential.givenName,
          family_name: credential.familyName,
        },
      }).catch(() => undefined);
    }

    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return appSession;
  } catch (error) {
    if (isCanceledAppleSignIn(error)) return null;
    throw error;
  }
}
