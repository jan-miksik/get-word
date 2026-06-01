'use client'

import type { RemoteFeatures, SocialProvider } from '@reown/appkit/react'

export const REQUIRED_AUTH_SOCIALS = ['google', 'apple'] as const satisfies readonly SocialProvider[]

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

export function installAppKitAuthFeatureGuard(appKit: AppKitAuthFeatureClient) {
  const applyRequiredAuthFeatures = (remoteFeatures: RemoteFeatures | undefined) => {
    if (hasRequiredAuthFeatures(remoteFeatures)) {
      return
    }

    appKit.updateRemoteFeatures(requiredAuthFeaturePatch(remoteFeatures))
  }

  applyRequiredAuthFeatures(appKit.getRemoteFeatures())

  return appKit.subscribeRemoteFeatures((remoteFeatures) => {
    applyRequiredAuthFeatures(remoteFeatures)
  })
}
