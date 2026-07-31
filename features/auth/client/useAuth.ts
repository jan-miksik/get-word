'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDeviceId, getDeviceId } from '@/lib/device-id'
import { clearLearningCache } from '@/lib/local-learning-cache'
import { clearPendingSync, resetSyncIdentity } from '@/lib/sync'
import { isSupabaseConfigured } from '@/features/auth/supabase/env'
import { apiFetch } from '@/features/shared/http/api-runtime'

type AuthStatus = 'connected' | 'disconnected' | 'connecting'

interface UseAuthReturn {
  /** App-authenticated (signed in via Supabase-backed login → app session). */
  isConnected: boolean
  /** Reserved for future wallet linking; always undefined for now. */
  address: string | undefined
  email: string | undefined
  /** Auth provider, e.g. "google" | "email". */
  authProvider: string | undefined
  /** Active school membership, or null when the account belongs to no school. */
  school: SchoolMembership | null
  status: AuthStatus
  isAuthLoading: boolean
  /**
   * True when the identity check failed or timed out, so we genuinely do not
   * know whether the visitor is signed in. Distinct from a confirmed
   * signed-out state: callers must not show the signed-out landing page here.
   */
  hasAuthError: boolean
  /** Re-run the identity check after a failure. */
  retryAuth: () => void
  /** Navigate to the login page. */
  signIn: () => void
  /** Clear the app session + local caches and return to home. */
  signOut: () => Promise<void>
  /** App-level account action (currently routes to the login/account page). */
  openAccountMenu: () => void
}

/**
 * Resolve when `promise` settles, or after `ms` — whichever comes first. Keeps a
 * hanging IndexedDB clear (seen on some Android WebViews) from blocking
 * post-logout navigation. Never rejects.
 */
function withTimeout(promise: Promise<unknown>, ms: number, message: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const timer = setTimeout(() => {
      console.warn(message)
      finish()
    }, ms)
    void Promise.resolve(promise)
      .catch((error) => console.error(message, error))
      .finally(() => {
        clearTimeout(timer)
        finish()
      })
  })
}

export interface SchoolMembership {
  id: string
  name: string
  role: 'student' | 'teacher'
}

interface MeResponse {
  authenticated: boolean
  email?: string | null
  authProvider?: string | null
  userRole?: string | null
  school?: SchoolMembership | null
}

/**
 * Cap on the identity check. `/api/auth/me` reads the session cookie and the
 * caller's school membership, so it touches the database — on a flaky network
 * the request can otherwise hang indefinitely and leave the app stuck on its
 * loading screen with no way out.
 */
const ME_FETCH_TIMEOUT_MS = 8_000

export function useAuth(): UseAuthReturn {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasAuthError, setHasAuthError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const signingOut = useRef(false)

  useEffect(() => {
    let active = true
    apiFetch('/api/auth/me', {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(ME_FETCH_TIMEOUT_MS),
    })
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data: MeResponse) => {
        if (active) setMe(data)
      })
      .catch((error) => {
        // Unreachable or too slow: we cannot tell signed-in from signed-out, so
        // surface an error instead of guessing "signed out" and showing the
        // landing page to someone who is actually logged in.
        if (!active) return
        console.error('[useAuth] Identity check failed:', error)
        setMe(null)
        setHasAuthError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attempt])

  // Resets live here rather than at the top of the effect: doing it there would
  // set state synchronously on every mount and cascade an extra render.
  const retryAuth = useCallback(() => {
    setLoading(true)
    setHasAuthError(false)
    setAttempt((value) => value + 1)
  }, [])

  const signIn = useCallback(() => {
    router.push('/login')
  }, [router])

  const openAccountMenu = useCallback(() => {
    router.push('/login')
  }, [router])

  const signOut = useCallback(async () => {
    if (signingOut.current) return
    signingOut.current = true
    const deviceId = getDeviceId()
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
    } catch (error) {
      console.error('[useAuth] Failed to clear server session cookie:', error)
    }

    // Best-effort: clear the dormant Supabase browser session too.
    if (isSupabaseConfigured()) {
      try {
        const { createSupabaseBrowserClient } = await import('@/features/auth/supabase/browser')
        await withTimeout(
          createSupabaseBrowserClient().auth.signOut(),
          2000,
          '[useAuth] Supabase signOut timed out'
        )
      } catch (error) {
        console.error('[useAuth] Supabase signOut failed:', error)
      }
    }

    clearPendingSync()
    resetSyncIdentity()
    deleteDeviceId()
    document.cookie = 'get_word_user_role=;path=/;max-age=0;SameSite=Lax'
    await withTimeout(clearLearningCache(), 2000, '[useAuth] clearLearningCache timed out')
    // Hard navigation: discards the entire authed React tree (and its in-memory
    // caches) in one step. A client-side `setMe` + `router.replace` would instead
    // flash the signed-out LandingPage — replaying its load animations — before
    // the route settled, so we go straight to a full reload of the public home.
    window.location.assign('/')
  }, [])

  const isConnected = Boolean(me?.authenticated)
  const status: AuthStatus = loading ? 'connecting' : isConnected ? 'connected' : 'disconnected'

  return {
    isConnected,
    address: undefined,
    email: me?.email ?? undefined,
    authProvider: me?.authProvider ?? undefined,
    school: me?.school ?? null,
    status,
    isAuthLoading: loading,
    hasAuthError,
    retryAuth,
    signIn,
    signOut,
    openAccountMenu,
  }
}
