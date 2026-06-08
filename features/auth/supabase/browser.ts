'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseAuthCookieOptions } from './cookie-options'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'

/**
 * Browser Supabase client. Used by the login page to start email OTP / Google
 * OAuth flows. Its session lives only long enough to reach the callback route,
 * which exchanges it for the app's own `get_word_session` cookie.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      detectSessionInUrl: false,
    },
    cookieOptions: getSupabaseAuthCookieOptions(),
  })
}
