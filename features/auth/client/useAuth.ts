'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDeviceId, getDeviceId } from '@/lib/device-id'
import { clearLearningCache } from '@/lib/local-learning-cache'
import { clearPendingSync, resetSyncIdentity } from '@/lib/sync'
import { isSupabaseConfigured } from '@/features/auth/supabase/env'

type AuthStatus = 'connected' | 'disconnected' | 'connecting'

interface UseAuthReturn {
  /** App-authenticated (signed in via Supabase-backed login → app session). */
  isConnected: boolean
  /** Reserved for future wallet linking; always undefined for now. */
  address: string | undefined
  email: string | undefined
  /** Auth provider, e.g. "google" | "email". */
  authProvider: string | undefined
  status: AuthStatus
  isAuthLoading: boolean
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

interface MeResponse {
  authenticated: boolean
  email?: string | null
  authProvider?: string | null
  userRole?: string | null
}

export function useAuth(): UseAuthReturn {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const signingOut = useRef(false)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data: MeResponse) => {
        if (active) setMe(data)
      })
      .catch(() => {
        if (active) setMe({ authenticated: false })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
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
      await fetch('/api/auth/logout', {
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
    setMe({ authenticated: false })
    router.replace('/')
  }, [router])

  const isConnected = Boolean(me?.authenticated)
  const status: AuthStatus = loading ? 'connecting' : isConnected ? 'connected' : 'disconnected'

  return {
    isConnected,
    address: undefined,
    email: me?.email ?? undefined,
    authProvider: me?.authProvider ?? undefined,
    status,
    isAuthLoading: loading,
    signIn,
    signOut,
    openAccountMenu,
  }
}
