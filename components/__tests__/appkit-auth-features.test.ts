import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteFeatures } from '@reown/appkit/react'
import {
  clearStaleAppKitAuthSession,
  hasRequiredAuthFeatures,
  installAppKitAuthFeatureGuard,
  mergeRequiredAuthSocials,
} from '@/components/appkit-auth-features'
import { MAGIC_ACCOUNT_ACCESS_DENIED_EVENT } from '@/lib/magic-rpc'

describe('appkit-auth-features', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears stale embedded auth storage without removing normal wallet connectors', () => {
    localStorage.setItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY', 'true')
    localStorage.setItem('@appkit-wallet/EMAIL', 'person@example.com')
    localStorage.setItem('@appkit-wallet/SESSION_TOKEN_KEY', 'token')
    localStorage.setItem('@appkit/eip155:connected_connector_id', 'AUTH')
    localStorage.setItem('@appkit/solana:connected_connector_id', 'injected')

    clearStaleAppKitAuthSession()

    expect(localStorage.getItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY')).toBeNull()
    expect(localStorage.getItem('@appkit-wallet/EMAIL')).toBeNull()
    expect(localStorage.getItem('@appkit-wallet/SESSION_TOKEN_KEY')).toBeNull()
    expect(localStorage.getItem('@appkit/eip155:connected_connector_id')).toBeNull()
    expect(localStorage.getItem('@appkit/solana:connected_connector_id')).toBe(
      'injected'
    )
  })

  it('preserves configured socials while adding required auth socials', () => {
    expect(mergeRequiredAuthSocials(['github'])).toEqual([
      'google',
      'apple',
      'github',
    ])
  })

  it('detects when email and required social login methods are available', () => {
    expect(
      hasRequiredAuthFeatures({ email: true, socials: ['google', 'apple'] })
    ).toBe(true)
    expect(hasRequiredAuthFeatures({ email: true, socials: ['google'] })).toBe(
      false
    )
    expect(
      hasRequiredAuthFeatures({ email: false, socials: ['google', 'apple'] })
    ).toBe(false)
  })

  it('reapplies local auth features after remote config removes them', () => {
    let subscriber: ((features: RemoteFeatures | undefined) => void) | undefined
    const appKit = {
      getRemoteFeatures: vi.fn((): RemoteFeatures => ({ email: false, socials: false })),
      updateRemoteFeatures: vi.fn<(newRemoteFeatures: Partial<RemoteFeatures>) => void>(),
      subscribeRemoteFeatures: vi.fn(
        (callback: (features: RemoteFeatures | undefined) => void): (() => void) => {
          subscriber = callback
          return vi.fn()
        }
      ),
    }
    const emitRemoteFeatures = (features: RemoteFeatures) => {
      if (!subscriber) {
        throw new Error('Remote features subscriber was not registered')
      }

      subscriber(features)
    }

    const cleanup = installAppKitAuthFeatureGuard(appKit)

    expect(appKit.updateRemoteFeatures).toHaveBeenCalledWith({
      email: true,
      socials: ['google', 'apple'],
    })

    appKit.updateRemoteFeatures.mockClear()
    emitRemoteFeatures({ email: true, socials: ['google', 'apple'] })
    expect(appKit.updateRemoteFeatures).not.toHaveBeenCalled()

    emitRemoteFeatures({ email: false, socials: false })
    expect(appKit.updateRemoteFeatures).toHaveBeenCalledWith({
      email: true,
      socials: ['google', 'apple'],
    })

    cleanup()
  })

  it('recovers auth features and clears stale auth storage when Magic denies access', () => {
    const unsubscribe = vi.fn()
    const appKit = {
      getRemoteFeatures: vi.fn((): RemoteFeatures => ({ email: false, socials: false })),
      updateRemoteFeatures: vi.fn<(newRemoteFeatures: Partial<RemoteFeatures>) => void>(),
      subscribeRemoteFeatures: vi.fn(() => unsubscribe),
    }
    localStorage.setItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY', 'true')

    const cleanup = installAppKitAuthFeatureGuard(appKit)
    appKit.updateRemoteFeatures.mockClear()

    window.dispatchEvent(new CustomEvent(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT))

    expect(localStorage.getItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY')).toBeNull()
    expect(appKit.updateRemoteFeatures).toHaveBeenCalledWith({
      email: true,
      socials: ['google', 'apple'],
    })

    cleanup()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
