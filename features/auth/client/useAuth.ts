'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'
import {
  clearStaleAppKitAuthSession,
  warmAppKitEmbeddedAuthFrame,
  waitForAppKitAuthUi,
} from '@/features/auth/client/appkit-auth-features'
import { logAuthBootDebug } from '@/features/auth/client/auth-boot-debug'
import { deleteDeviceId, getDeviceId } from '@/lib/device-id'
import { clearLearningCache } from '@/lib/local-learning-cache'
import {
  MAGIC_ACCOUNT_ACCESS_DENIED_EVENT,
  hasRecentMagicAccountAccessDenied,
} from '@/features/auth/client/magic-rpc'
import { clearPendingSync, resetSyncIdentity } from '@/lib/sync'

type AuthStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting'

/**
 * Resolve when `promise` settles, or after `ms` — whichever comes first. Used so
 * a hanging wallet disconnect or IndexedDB clear (seen on some Android WebViews)
 * can never block the post-logout navigation. Never rejects.
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
      .catch((error) => {
        console.error(message, error)
      })
      .finally(() => {
        clearTimeout(timer)
        finish()
      })
  })
}

/**
 * How long to wait for a persisted (e.g. Magic-based embedded wallet) session
 * to finish reconnecting before treating it as failed and falling back to the
 * Connect flow. Reown / Magic do not always surface the "User denied account
 * access" rejection back into the AppKit state machine, so without this the
 * UI can sit on the loading gate forever. iOS PWAs can take a while to bring
 * the embedded auth frame back after a cold launch, so keep this long enough
 * for a valid social/email session to auto-restore.
 */
const RECONNECT_TIMEOUT_MS = 12_000

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
    logAuthBootDebug('use-auth-account-state', {
      status,
      isConnected,
      addressPresent: Boolean(address),
      emailPresent: Boolean(embeddedWalletInfo?.user?.email),
      authProvider,
    })
  }, [address, authProvider, embeddedWalletInfo?.user?.email, isConnected, status])
  const reconnectFallbackFired = useRef(false)

  const prepareAuthConnect = useCallback(async () => {
    logAuthBootDebug('prepare-auth-connect-start')
    const authUiReady = await waitForAppKitAuthUi()
    const embeddedAuthWarmed = await warmAppKitEmbeddedAuthFrame()
    logAuthBootDebug('prepare-auth-connect-finished', {
      authUiReady,
      embeddedAuthWarmed,
    })
    return authUiReady
  }, [])

  const openConnectModal = useCallback(async (
    authUiPrepared = false,
    preparedAuthUiReady = authUiPrepared
  ) => {
    logAuthBootDebug('connect-modal-open-requested', {
      authUiPrepared,
      preparedAuthUiReady,
      currentStatus: statusRef.current,
    })

    let authUiReady = preparedAuthUiReady

    if (!authUiPrepared) {
      authUiReady = await waitForAppKitAuthUi()
      logAuthBootDebug('connect-modal-auth-ui-wait-complete', {
        authUiReady,
        currentStatus: statusRef.current,
      })
    }

    if (!authUiReady) {
      console.warn('[useAuth] Opening AppKit connect modal before auth UI is fully ready')
      logAuthBootDebug('connect-modal-open-not-fully-ready', {
        currentStatus: statusRef.current,
      })
    }

    logAuthBootDebug('connect-modal-open-before-appkit-open', {
      currentStatus: statusRef.current,
    })
    void open({ view: 'Connect' })
      .then(() => {
        logAuthBootDebug('connect-modal-open-resolved', {
          currentStatus: statusRef.current,
        })
      })
      .catch((error) => {
        console.error('[useAuth] Failed to open AppKit connect modal:', error)
        logAuthBootDebug('connect-modal-open-error', {
          error: error instanceof Error ? error.message : String(error),
          currentStatus: statusRef.current,
        })
      })
  }, [open])

  const signIn = useCallback(() => {
    logAuthBootDebug('sign-in-start', {
      currentStatus: statusRef.current,
    })
    void prepareAuthConnect()
      .catch((error) => {
        console.warn('[useAuth] AppKit auth UI prep failed before signIn open:', error)
        logAuthBootDebug('sign-in-prepare-error', {
          error: error instanceof Error ? error.message : String(error),
          currentStatus: statusRef.current,
        })
        return false
      })
      .then((authUiReady) => {
        logAuthBootDebug('sign-in-prepare-complete', {
          currentStatus: statusRef.current,
          authUiReady,
        })
        if (statusRef.current === 'connected') {
          logAuthBootDebug('sign-in-modal-skipped', {
            reason: 'already-connected',
          })
          return
        }

        if (!authUiReady) {
          console.warn('[useAuth] AppKit auth UI was not fully ready before signIn open')
        }

        void openConnectModal(true, authUiReady)
      })
  }, [openConnectModal, prepareAuthConnect])

  const signOut = useCallback(async () => {
    logAuthBootDebug('sign-out-start', {
      currentStatus: statusRef.current,
    })
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
    await withTimeout(clearLearningCache(), 2000, '[useAuth] clearLearningCache timed out')
    await withTimeout(Promise.resolve(disconnect()), 2000, '[useAuth] wallet disconnect timed out')
    logAuthBootDebug('sign-out-finished')
  }, [disconnect])

  const clearRejectedReconnect = useCallback(
    (message: string) => {
      reconnectFallbackFired.current = true
      console.warn(message)
      logAuthBootDebug('reconnect-fallback-start', {
        message,
        currentStatus: statusRef.current,
      })
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
      void openConnectModal()
      logAuthBootDebug('reconnect-fallback-finished', {
        currentStatus: statusRef.current,
      })
    },
    [disconnect, openConnectModal]
  )

  const isWaitingForWalletProvider = useCallback(
    () => statusRef.current === 'connecting' || statusRef.current === 'reconnecting',
    []
  )

  // Fallback for wedged reconnects: if AppKit's status sits at `reconnecting`
  // past the timeout (typical when a Magic embedded-wallet session fails to
  // restore), force-disconnect to clear the stale session and pop the Connect
  // modal so the user can sign in again. This keeps the loading screen up
  // during normal auto-restore but bounds how long it can show.
  useEffect(() => {
    const handleMagicAccountAccessDenied = () => {
      logAuthBootDebug('magic-account-access-denied-event', {
        currentStatus: statusRef.current,
      })
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
    if (isConnected) {
      reconnectFallbackFired.current = false
      return
    }

    if (!isWaitingForWalletProvider()) {
      reconnectFallbackFired.current = false
      return
    }
    if (reconnectFallbackFired.current) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      logAuthBootDebug('reconnect-timeout-fired', {
        currentStatus: statusRef.current,
        timeoutMs: RECONNECT_TIMEOUT_MS,
      })
      clearRejectedReconnect(
        `[useAuth] Wallet ${statusRef.current} timed out; clearing session and opening Connect modal`
      )
    }, RECONNECT_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    status,
    isConnected,
    clearRejectedReconnect,
    isWaitingForWalletProvider,
    openConnectModal,
  ])

  const openAccountMenu = useCallback(() => {
    logAuthBootDebug('account-menu-open-requested', {
      isConnected,
      status,
    })
    if (isConnected) {
      void open({ view: 'Account' }).catch((error) => {
        console.error('[useAuth] Failed to open AppKit account modal:', error)
        logAuthBootDebug('account-menu-open-error', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
    } else {
      void openConnectModal()
    }
  }, [open, isConnected, openConnectModal])

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
