import type { CookieOptionsWithName } from '@supabase/ssr'

export const SUPABASE_AUTH_COOKIE_NAME = 'get_word_supabase_auth'

export function getSupabaseAuthCookieOptions(): CookieOptionsWithName {
  return {
    name: SUPABASE_AUTH_COOKIE_NAME,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }
}
