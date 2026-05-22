'use client'

import { useCallback } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'
import { deleteDeviceId, getDeviceId } from '@/lib/device-id'
import { clearLearningCache } from '@/lib/local-learning-cache'
import { clearPendingSync, resetSyncIdentity } from '@/lib/sync'

type AuthStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting'

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
  const status = accountStatus ?? 'reconnecting'
  const isAuthLoading = status === 'connecting' || status === 'reconnecting'

  // Reown may expose loginMethod or type on embedded wallet user (e.g. "google" | "email")
  const authProvider =
    (embeddedWalletInfo as { user?: { type?: string; loginMethod?: string } } | undefined)?.user?.type ??
    (embeddedWalletInfo as { user?: { type?: string; loginMethod?: string } } | undefined)?.user?.loginMethod ??
    undefined

  const signIn = useCallback(() => {
    void open({ view: 'Connect' }).catch((error) => {
      console.error('[useAuth] Failed to open AppKit connect modal:', error)
    })
  }, [open])

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
