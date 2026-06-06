import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'

/**
 * Server Supabase client for Route Handlers (the auth callback). Reads/writes
 * the Supabase auth cookies so `exchangeCodeForSession` and `getUser()` work,
 * but we only use it once per login to verify identity before minting the app
 * session. Always validate identity with `getUser()` (verifies the JWT against
 * Supabase) rather than `getSession()` (reads the cookie unverified).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // `setAll` can be called from a context where mutating cookies is not
          // allowed (e.g. a Server Component). The callback route runs in a
          // Route Handler where this is fine; ignore elsewhere.
        }
      },
    },
  })
}
