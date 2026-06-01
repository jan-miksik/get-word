'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'
import { clearStaleAppKitAuthSession } from '@/components/appkit-auth-features'
import { deleteDeviceId, getDeviceId } from '@/lib/device-id'
import { clearLearningCache } from '@/lib/local-learning-cache'
import {
  MAGIC_ACCOUNT_ACCESS_DENIED_EVENT,
  hasRecentMagicAccountAccessDenied,
} from '@/lib/magic-rpc'
import { clearPendingSync, resetSyncIdentity } from '@/lib/sync'

type AuthStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting'

/**
 * How long to wait for a persisted (e.g. Magic-based embedded wallet) session
 * to finish reconnecting before treating it as failed and falling back to the
 * Connect flow. Reown / Magic do not always surface the "User denied account
 * access" rejection back into the AppKit state machine, so without this the
 * UI can sit on the loading gate forever.
 */
const RECONNECT_TIMEOUT_MS = 8000

interface UseAuthReturn {
  isConnected: boolean
  address: string | undefined
  email: string | undefined
  /** Auth provider when using embedded wallet, e.g. "google" | "email" */
  authProvider: string | undefined
  status: AuthStatus
  isAuthLoading: boolean
  signIn: () => void
  signOut: () => Promise<void>
  /** Opens Reown wallet/account menu (when connected shows account view, otherwise connect flow) */
  openAccountMenu: () => void
}

export function useAuth(): UseAuthReturn {
  const { open } = useAppKit()
  const { isConnected, address, embeddedWalletInfo, status: accountStatus } = useAppKitAccount()
  const { disconnect } = useDisconnect()
  const status = accountStatus ?? 'disconnected'
  const isAuthLoading = status === 'connecting' || status === 'reconnecting'

  // Reown may expose loginMethod or type on embedded wallet user (e.g. "google" | "email")
  const authProvider =
    (embeddedWalletInfo as { user?: { type?: string; loginMethod?: string } } | undefined)?.user?.type ??
    (embeddedWalletInfo as { user?: { type?: string; loginMethod?: string } } | undefined)?.user?.loginMethod ??
    undefined
  const statusRef = useRef(status)

  useEffect(() => {
    statusRef.current = status
  }, [status])
  const reconnectFallbackFired = useRef(false)

  const signIn = useCallback(() => {
    const openConnectModal = () => {
      void open({ view: 'Connect' }).catch((error) => {
        console.error('[useAuth] Failed to open AppKit connect modal:', error)
      })
    }

    if (statusRef.current !== 'connecting' && statusRef.current !== 'reconnecting') {
      openConnectModal()
      return
    }

    try {
      void Promise.resolve(disconnect())
        .catch((error) => {
          console.error('[useAuth] Failed to clear stale wallet session before sign-in:', error)
        })
        .finally(openConnectModal)
    } catch (error) {
      console.error('[useAuth] Failed to clear stale wallet session before sign-in:', error)
      openConnectModal()
    }
  }, [disconnect, open])

  const signOut = useCallback(async () => {
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
    clearPendingSync()
    resetSyncIdentity()
    deleteDeviceId()
    document.cookie = 'get_word_user_role=;path=/;max-age=0;SameSite=Lax'
    await clearLearningCache()
    await Promise.resolve(disconnect())
  }, [disconnect])

  const clearRejectedReconnect = useCallback(
    (message: string) => {
      reconnectFallbackFired.current = true
      console.warn(message)
      clearStaleAppKitAuthSession()
      try {
        const result = disconnect() as unknown
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error('[useAuth] Fallback disconnect failed:', error)
          })
        }
      } catch (error) {
        console.error('[useAuth] Fallback disconnect threw:', error)
      }
      void open({ view: 'Connect' }).catch((error) => {
        console.error(
          '[useAuth] Failed to open Connect modal after reconnect recovery:',
          error
        )
      })
    },
    [disconnect, open]
  )

  const isWaitingForWalletProvider = useCallback(
    () => statusRef.current === 'connecting' || statusRef.current === 'reconnecting',
    []
  )

  // Fallback for wedged reconnects: if AppKit's status sits at `reconnecting`
  // past the timeout (typical when a Magic embedded-wallet session fails to
  // restore), force-disconnect to clear the stale session and pop the Connect
  // modal so the user can sign in again. This keeps the loading screen up
  // (no disconnected-to-connected flash) but bounds how long it can show.
  useEffect(() => {
    const handleMagicAccountAccessDenied = () => {
      clearStaleAppKitAuthSession()

      if (!isWaitingForWalletProvider()) {
        return
      }

      clearRejectedReconnect(
        '[useAuth] Magic account access denied during wallet reconnect; clearing session and opening Connect modal'
      )
    }

    window.addEventListener(
      MAGIC_ACCOUNT_ACCESS_DENIED_EVENT,
      handleMagicAccountAccessDenied
    )

    return () => {
      window.removeEventListener(
        MAGIC_ACCOUNT_ACCESS_DENIED_EVENT,
        handleMagicAccountAccessDenied
      )
    }
  }, [clearRejectedReconnect, isWaitingForWalletProvider])

  useEffect(() => {
    if (!isWaitingForWalletProvider() || !hasRecentMagicAccountAccessDenied()) {
      return
    }

    clearRejectedReconnect(
      '[useAuth] Magic account access denial was detected before auth mounted; clearing session and opening Connect modal'
    )
  }, [clearRejectedReconnect, isWaitingForWalletProvider, status])

  useEffect(() => {
    if (!isWaitingForWalletProvider()) {
      reconnectFallbackFired.current = false
      return
    }
    if (reconnectFallbackFired.current) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      clearRejectedReconnect(
        `[useAuth] Wallet ${statusRef.current} timed out; clearing session and opening Connect modal`
      )
    }, RECONNECT_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [status, clearRejectedReconnect, isWaitingForWalletProvider])

  const openAccountMenu = useCallback(() => {
    if (isConnected) {
      void open({ view: 'Account' }).catch((error) => {
        console.error('[useAuth] Failed to open AppKit account modal:', error)
      })
    } else {
      void open({ view: 'Connect' }).catch((error) => {
        console.error('[useAuth] Failed to open AppKit connect modal:', error)
      })
    }
  }, [open, isConnected])

  return {
    isConnected,
    address,
    email: embeddedWalletInfo?.user?.email ?? undefined,
    authProvider,
    status,
    isAuthLoading,
    signIn,
    signOut,
    openAccountMenu,
  }
}
