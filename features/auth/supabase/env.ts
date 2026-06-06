/**
 * Supabase project configuration. Supabase is used only as a one-shot identity
 * verifier during login/callback — the app's trusted session is the
 * `get_word_session` HMAC cookie (see lib/session.ts), not Supabase's session.
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  return url
}

/**
 * The browser-safe Supabase "publishable" key (`sb_publishable_…`). Used by the
 * browser/server clients to start the Supabase Auth flow. Never expose the
 * secret/service_role key in a NEXT_PUBLIC_ var.
 */
export function getSupabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key)
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured')
  return key
}

/** True when both public Supabase env vars are present (used to gate UI/login). */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}
