'use client'

import { useAuth } from '@/hooks/useAuth'

interface AuthButtonProps {
  /** When true, show as logged in (from Reown or from server-linked account) */
  isAuthenticated?: boolean
  /** Email to show (from Reown or from server) */
  authEmail?: string
  /** Wallet address to show (from Reown or from server) */
  authAddress?: string
  /** Larger sign-in button (e.g. for top center when not logged in) */
  size?: 'default' | 'large'
}

export function AuthButton({ isAuthenticated: propAuthenticated, authEmail: propEmail, authAddress: propAddress, size = 'default' }: AuthButtonProps = {}) {
  const { isConnected, email, address, signIn, openAccountMenu } = useAuth()

  const isAuthenticated = propAuthenticated ?? isConnected
  const displayEmail = propEmail ?? email
  const displayAddress = propAddress ?? address

  if (isAuthenticated) {
    const displayName =
      displayEmail ||
      (displayAddress ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}` : 'Account linked')
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
      className={size === 'large' ? 'auth-button auth-button--large' : 'auth-button'}
      title="Connect to sync across devices"
    >
      Connect
    </button>
  )
}
