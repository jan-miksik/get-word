import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/features/auth/supabase/server'
import { createSupabaseTokenVerifier } from '@/features/auth/supabase/token-verifier'
import { resolveAndAttachSupabaseUser } from '@/features/auth/server/resolve-supabase-user'
import { withSessionCookie } from '@/features/shared/routes/session'
import { readBearerToken, signSession } from '@/lib/session'
import { NextResponse } from 'next/server'

type SyncUserBody = {
  deviceId?: string
  client?: 'web' | 'ios'
}

/**
 * Client-initiated mint of the app session after a Supabase sign-in. Web
 * clients authenticate with Supabase cookies; native clients send their
 * short-lived Supabase access token as a bearer token. We verify with
 * getUser(), resolve/attach the app user — passing the device id so a first-time
 * login can claim existing device progress without merging/deleting rows —
 * then mint `get_word_session`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request
      .json()
      .then((value: SyncUserBody | null) => value ?? {})
      .catch(() => ({} as SyncUserBody))
    const deviceId =
      request.headers.get('x-device-id') ||
      body.deviceId ||
      null

    const supabaseAccessToken = readBearerToken(request)
    if (body.client === 'ios' && !supabaseAccessToken) {
      return NextResponse.json(
        { success: false, error: 'Missing Supabase bearer token' },
        { status: 401 }
      )
    }

    const verification = supabaseAccessToken
      ? await createSupabaseTokenVerifier().auth.getUser(supabaseAccessToken)
      : await (await createSupabaseServerClient()).auth.getUser()
    const { user } = verification.data
    const { error } = verification

    if (error || !user) {
      console.warn('[auth/sync-user] Supabase session verification failed', {
        source: supabaseAccessToken ? 'bearer' : 'cookie',
        code: error?.code,
        status: error?.status,
        message: error?.message,
      })
      return NextResponse.json(
        {
          success: false,
          error: supabaseAccessToken
            ? 'Supabase bearer token was rejected by the API'
            : 'No verified Supabase session',
        },
        { status: 401 }
      )
    }

    const appUser = await resolveAndAttachSupabaseUser({
      supabaseAuthId: user.id,
      email: user.email ?? null,
      authProvider: (user.app_metadata?.provider as string | undefined) ?? null,
      deviceId,
    })

    const payload: Record<string, unknown> = {
      success: true,
      userId: appUser.id,
      email: appUser.email ?? null,
      authProvider: appUser.authProvider ?? null,
      userRole: appUser.userRole,
    }

    // WKWebView runs under a local Capacitor origin, so it cannot rely on the
    // same-origin HttpOnly cookie used by the web app. Return the same signed
    // app-session format as an explicit bearer token after Supabase has verified
    // the native access token. The mobile client must store this in Keychain.
    if (body.client === 'ios') {
      payload.sessionToken = await signSession({
        userId: appUser.id,
        userRole: appUser.userRole === 'editor' ? 'editor' : 'user',
      })
    }

    return withSessionCookie(payload, appUser.id, appUser.userRole)
  } catch (err) {
    console.error('[auth/sync-user] Failed to sync Supabase user:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to sync user' },
      { status: 500 }
    )
  }
}
