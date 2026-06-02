'use client'

import { useAuth } from '@/features/auth/client/useAuth'
import { useI18n } from '@/components/I18nProvider'

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
  const { t } = useI18n()

  const isAuthenticated = propAuthenticated ?? isConnected
  const displayEmail = propEmail ?? email
  const displayAddress = propAddress ?? address

  if (isAuthenticated) {
    const displayName =
      displayEmail ||
      (displayAddress ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}` : t('auth.accountLinked'))
    return (
      <button
        onClick={openAccountMenu}
        className="auth-button is-connected"
        title={t('auth.signedInAs', { name: displayName })}
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
      title={t('auth.connectTooltip')}
    >
      {t('auth.connectButton')}
    </button>
  )
}
