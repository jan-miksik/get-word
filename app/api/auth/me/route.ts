import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthenticatedUser } from '@/lib/auth'
import { getActiveSchoolEntitlement } from '@/features/schools/server/entitlements'

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
  // Rides along here rather than on its own endpoint: the client needs it on
  // every load to show school membership in the menu, and this response is
  // already fetched once at startup for signed-in users only.
  //
  // Never fatal: this response gates the whole client boot, and a missing
  // school badge is a far smaller failure than an app that will not start.
  const school = await getActiveSchoolEntitlement(user.id).catch((error) => {
    console.error('[api/auth/me] School entitlement lookup failed:', error)
    return null
  })
  return NextResponse.json(
    {
      authenticated: true,
      school: school
        ? { id: school.schoolId, name: school.schoolName, role: school.role }
        : null,
      email: user.email ?? null,
      authProvider: user.authProvider ?? null,
      userRole: user.userRole,
      languageFrom: user.languageFrom ?? null,
      languageTo: user.languageTo ?? null,
      onboardingCompletedAt: user.onboardingCompletedAt
        ? user.onboardingCompletedAt.toISOString()
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
