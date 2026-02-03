'use client'

import { useCallback } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'

interface UseAuthReturn {
  isConnected: boolean
  address: string | undefined
  email: string | undefined
  signIn: () => void
  signOut: () => void
}

export function useAuth(): UseAuthReturn {
  const { open } = useAppKit()
  const { isConnected, address, embeddedWalletInfo } = useAppKitAccount()
  const { disconnect } = useDisconnect()

  const signIn = useCallback(() => {
    open()
  }, [open])

  const signOut = useCallback(() => {
    disconnect()
  }, [disconnect])

  return {
    isConnected,
    address,
    email: embeddedWalletInfo?.user?.email ?? undefined,
    signIn,
    signOut,
  }
}
