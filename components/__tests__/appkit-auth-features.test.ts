import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteFeatures } from '@reown/appkit/react'

const { mockConnectorController } = vi.hoisted(() => ({
  mockConnectorController: {
    getAuthConnector: vi.fn(),
    subscribeKey: vi.fn(),
  },
}))

vi.mock('@reown/appkit-controllers', () => ({
  ConnectorController: mockConnectorController,
}))

import {
  clearStaleAppKitAuthSession,
  hasRequiredAuthFeatures,
  installAppKitAuthFeatureGuard,
  mergeRequiredAuthSocials,
  waitForAppKitAuthConnector,
} from '@/components/appkit-auth-features'
import { MAGIC_ACCOUNT_ACCESS_DENIED_EVENT } from '@/lib/magic-rpc'

describe('appkit-auth-features', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mockConnectorController.getAuthConnector.mockReturnValue(undefined)
    mockConnectorController.subscribeKey.mockReturnValue(vi.fn())
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

  it('detects an AppKit auth connector immediately when it is already registered', async () => {
    mockConnectorController.getAuthConnector.mockReturnValue({ id: 'AUTH' })

    await expect(waitForAppKitAuthConnector()).resolves.toBe(true)

    expect(mockConnectorController.subscribeKey).not.toHaveBeenCalled()
  })

  it('waits for AppKit auth connector registration before resolving', async () => {
    const unsubscribe = vi.fn()
    let connectorsCallback: (() => void) | undefined
    mockConnectorController.getAuthConnector
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ id: 'AUTH' })
    mockConnectorController.subscribeKey.mockImplementation((_key, callback) => {
      connectorsCallback = callback as () => void
      return unsubscribe
    })

    const readyPromise = waitForAppKitAuthConnector()
    expect(connectorsCallback).toBeDefined()

    connectorsCallback?.()

    await expect(readyPromise).resolves.toBe(true)
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('stops waiting for AppKit auth connector after the timeout', async () => {
    vi.useFakeTimers()
    const unsubscribe = vi.fn()
    mockConnectorController.subscribeKey.mockReturnValue(unsubscribe)

    const readyPromise = waitForAppKitAuthConnector(100)

    vi.advanceTimersByTime(100)

    await expect(readyPromise).resolves.toBe(false)
    expect(unsubscribe).toHaveBeenCalled()
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
