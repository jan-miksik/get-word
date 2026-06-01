import { describe, expect, it, vi } from 'vitest'
import type { RemoteFeatures } from '@reown/appkit/react'
import {
  hasRequiredAuthFeatures,
  installAppKitAuthFeatureGuard,
  mergeRequiredAuthSocials,
} from '@/components/appkit-auth-features'

describe('appkit-auth-features', () => {
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

    installAppKitAuthFeatureGuard(appKit)

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
  })
})
