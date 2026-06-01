'use client'

import type { RemoteFeatures, SocialProvider } from '@reown/appkit/react'
import { MAGIC_ACCOUNT_ACCESS_DENIED_EVENT } from '@/lib/magic-rpc'

export const REQUIRED_AUTH_SOCIALS = ['google', 'apple'] as const satisfies readonly SocialProvider[]

const APPKIT_WALLET_STORAGE_PREFIX = '@appkit-wallet/'
const APPKIT_AUTH_STORAGE_KEYS = [
  `${APPKIT_WALLET_STORAGE_PREFIX}EMAIL_LOGIN_USED_KEY`,
  `${APPKIT_WALLET_STORAGE_PREFIX}EMAIL`,
  `${APPKIT_WALLET_STORAGE_PREFIX}LAST_USED_CHAIN_KEY`,
  `${APPKIT_WALLET_STORAGE_PREFIX}SESSION_TOKEN_KEY`,
  `${APPKIT_WALLET_STORAGE_PREFIX}SOCIAL_USERNAME`,
  '@appkit/connected_social',
  '@appkit-wallet/SOCIAL_USERNAME',
] as const

const APPKIT_CONNECTED_CONNECTOR_KEYS = [
  '@appkit/eip155:connected_connector_id',
  '@appkit/solana:connected_connector_id',
] as const

type AppKitAuthFeatureClient = {
  getRemoteFeatures: () => RemoteFeatures | undefined
  updateRemoteFeatures: (newRemoteFeatures: Partial<RemoteFeatures>) => void
  subscribeRemoteFeatures: (
    callback: (newState: RemoteFeatures | undefined) => void
  ) => () => void
}

export function mergeRequiredAuthSocials(
  socials: RemoteFeatures['socials'] | undefined
): SocialProvider[] {
  const merged = new Set<SocialProvider>(REQUIRED_AUTH_SOCIALS)

  if (Array.isArray(socials)) {
    socials.forEach((social) => merged.add(social))
  }

  return Array.from(merged)
}

export function hasRequiredAuthFeatures(
  remoteFeatures: Partial<RemoteFeatures> | undefined
): boolean {
  const socials = remoteFeatures?.socials

  return (
    remoteFeatures?.email === true &&
    Array.isArray(socials) &&
    REQUIRED_AUTH_SOCIALS.every((social) => socials.includes(social))
  )
}

function requiredAuthFeaturePatch(
  remoteFeatures: Partial<RemoteFeatures> | undefined
): Partial<RemoteFeatures> {
  return {
    email: true,
    socials: mergeRequiredAuthSocials(remoteFeatures?.socials),
  }
}

export function clearStaleAppKitAuthSession() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    APPKIT_AUTH_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key)
    })

    APPKIT_CONNECTED_CONNECTOR_KEYS.forEach((key) => {
      if (window.localStorage.getItem(key) === 'AUTH') {
        window.localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.warn('[AppKit] Failed to clear stale embedded auth session:', error)
  }
}

function recoverAppKitAuthFeatures(
  appKit: AppKitAuthFeatureClient,
  remoteFeatures: RemoteFeatures | undefined
) {
  clearStaleAppKitAuthSession()
  appKit.updateRemoteFeatures(requiredAuthFeaturePatch(remoteFeatures))
}

export function installAppKitAuthFeatureGuard(appKit: AppKitAuthFeatureClient) {
  const applyRequiredAuthFeatures = (remoteFeatures: RemoteFeatures | undefined) => {
    if (hasRequiredAuthFeatures(remoteFeatures)) {
      return
    }

    appKit.updateRemoteFeatures(requiredAuthFeaturePatch(remoteFeatures))
  }

  applyRequiredAuthFeatures(appKit.getRemoteFeatures())

  const unsubscribeRemoteFeatures = appKit.subscribeRemoteFeatures((remoteFeatures) => {
    applyRequiredAuthFeatures(remoteFeatures)
  })

  if (typeof window === 'undefined') {
    return unsubscribeRemoteFeatures
  }

  const recoverFromMagicDenial = () => {
    recoverAppKitAuthFeatures(appKit, appKit.getRemoteFeatures())
  }

  window.addEventListener(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT, recoverFromMagicDenial)

  return () => {
    unsubscribeRemoteFeatures()
    window.removeEventListener(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT, recoverFromMagicDenial)
  }
}
