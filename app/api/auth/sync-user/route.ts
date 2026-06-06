import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/features/auth/supabase/server'
import { resolveAndAttachSupabaseUser } from '@/features/auth/server/resolve-supabase-user'
import { withSessionCookie } from '@/features/shared/routes/session'
import { NextResponse } from 'next/server'

/**
 * Client-initiated mint of the app session after a Supabase sign-in (email OTP,
 * or a re-sync). The client must already hold a Supabase session (its cookies
 * are sent with this request). We verify with getUser(), resolve/attach the app
 * user — passing the device id so a first-time login can claim existing device
 * progress without merging/deleting rows — then mint `get_word_session`.
 */
export async function POST(request: NextRequest) {
  try {
    const deviceId =
      request.headers.get('x-device-id') ||
      (await request
        .json()
        .then((b: { deviceId?: string } | null) => b?.deviceId ?? null)
        .catch(() => null))

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'No verified Supabase session' },
        { status: 401 }
      )
    }

    const appUser = await resolveAndAttachSupabaseUser({
      supabaseAuthId: user.id,
      email: user.email ?? null,
      authProvider: (user.app_metadata?.provider as string | undefined) ?? null,
      deviceId,
    })

    return withSessionCookie(
      {
        success: true,
        userId: appUser.id,
        email: appUser.email ?? null,
        authProvider: appUser.authProvider ?? null,
        userRole: appUser.userRole,
      },
      appUser.id,
      appUser.userRole
    )
  } catch (err) {
    console.error('[auth/sync-user] Failed to sync Supabase user:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to sync user' },
      { status: 500 }
    )
  }
}
