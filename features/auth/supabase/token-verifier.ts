import { createClient } from '@supabase/supabase-js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '@/features/auth/supabase/env'

/**
 * Cookie-independent client for verifying an explicit Supabase bearer token.
 * Native clients do not share the web app's cookie storage, so their access
 * token must not be verified through the SSR/cookie client.
 */
export function createSupabaseTokenVerifier() {
  return createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
