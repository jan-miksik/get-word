import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthenticatedUser } from '@/lib/auth'

/**
 * Lightweight identity check for the client. Reads the app session cookie
 * (`get_word_session`) only — no Supabase network call — and reports who the
 * current user is. Returns `{ authenticated: false }` for anonymous/device-only
 * visitors who have not signed in.
 */
export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(
    {
      authenticated: true,
      email: user.email ?? null,
      authProvider: user.authProvider ?? null,
      userRole: user.userRole,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
