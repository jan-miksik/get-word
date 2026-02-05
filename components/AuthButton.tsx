'use client'

import { useAuth } from '@/hooks/useAuth'

export function AuthButton() {
  const { isConnected, email, address, signIn, openAccountMenu } = useAuth()

  if (isConnected) {
    const displayName = email || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected')
    return (
      <button
        onClick={openAccountMenu}
        className="auth-button is-connected"
        title={`Signed in as ${displayName}. Click for account options.`}
      >
        <span className="auth-dot" />
        <span className="auth-label">{displayName}</span>
      </button>
    )
  }

  return (
    <button
      onClick={signIn}
      className="auth-button"
      title="Sign in to sync across devices"
    >
      Sign in
    </button>
  )
}
