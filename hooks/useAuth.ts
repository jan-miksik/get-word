'use client'

import { useCallback } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'

export function useAuth() {
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
    email: embeddedWalletInfo?.user?.email,
    signIn,
    signOut,
  }
}
