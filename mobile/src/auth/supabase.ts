import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  hasMobileAuthConfiguration,
  supabasePublishableKey,
  supabaseUrl,
} from '../config';

let supabaseClient: SupabaseClient | null = null;

/**
 * One ephemeral Supabase client for native identity verification. Get Word's
 * own bearer session is the durable session and lives in the iOS Keychain, so
 * Supabase persistence and automatic refresh deliberately stay disabled.
 */
export function getMobileSupabaseClient(): SupabaseClient {
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
