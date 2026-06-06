import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/features/auth/supabase/server'
import { resolveAndAttachSupabaseUser } from '@/features/auth/server/resolve-supabase-user'
import { setSessionCookieOnResponse } from '@/features/shared/routes/session'

function sanitizeNext(input: string | null): string {
  if (!input || !input.startsWith('/') || input.startsWith('//')) return '/'
  return input
}

/**
 * Supabase OAuth / magic-link callback. Exchanges the PKCE `code` for a
 * Supabase session, verifies the user with getUser() (validates the JWT — never
 * trust getSession() here), resolves/attaches the app user, then mints the
 * app's own long-lived `get_word_session` cookie and redirects.
 *
 * A top-level redirect has no access to the device id (localStorage), so the
 * login page sets a short-lived `gw_device_claim` cookie before starting OAuth.
 * We read it here so a device-only owner's progress/lists are claimed rather
 * than orphaned, then clear it.
 */
const DEVICE_CLAIM_COOKIE = 'gw_device_claim'
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const next = sanitizeNext(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error')

  const redirectTo = (path: string) => new URL(path, url.origin)

  if (oauthError) {
    return NextResponse.redirect(
      redirectTo(`/login?error=${encodeURIComponent(oauthError)}`)
    )
  }
  if (!code) {
    return NextResponse.redirect(redirectTo('/login?error=missing_code'))
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(
        redirectTo(`/login?error=${encodeURIComponent(exchangeError.message)}`)
      )
    }

    // Verify identity against Supabase's auth server (not just the cookie).
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.redirect(redirectTo('/login?error=verification_failed'))
    }

    const deviceId = request.cookies.get(DEVICE_CLAIM_COOKIE)?.value ?? null

    const appUser = await resolveAndAttachSupabaseUser({
      supabaseAuthId: user.id,
      email: user.email ?? null,
      authProvider: (user.app_metadata?.provider as string | undefined) ?? null,
      deviceId: deviceId ? decodeURIComponent(deviceId) : null,
    })

    const response = NextResponse.redirect(redirectTo(next))
    // Consume the one-shot device-claim cookie.
    response.cookies.set({ name: DEVICE_CLAIM_COOKIE, value: '', path: '/', maxAge: 0 })
    return setSessionCookieOnResponse(response, appUser.id, appUser.userRole)
  } catch (error) {
    console.error('[auth/callback] Failed to complete Supabase login:', error)
    return NextResponse.redirect(redirectTo('/login?error=callback_failed'))
  }
}
