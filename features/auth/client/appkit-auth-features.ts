'use client'

import type { RemoteFeatures, SocialProvider } from '@reown/appkit/react'
import {
  ChainController,
  ConnectorController,
  OptionsController,
} from '@reown/appkit-controllers'
import {
  logAuthBootDebug,
  markAppKitReadyDebugInstalled,
  markAppKitReadyDebugSettled,
} from '@/features/auth/client/auth-boot-debug'
import { MAGIC_ACCOUNT_ACCESS_DENIED_EVENT } from '@/features/auth/client/magic-rpc'

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
const AUTH_CONNECTOR_READY_TIMEOUT_MS = 4_000
const AUTH_UI_READY_TIMEOUT_MS = 12_000
const APPKIT_READY_TIMEOUT_MS = 15_000

type AppKitAuthFeatureClient = {
  ready?: () => Promise<void> | void
  getRemoteFeatures: () => RemoteFeatures | undefined
  updateRemoteFeatures: (newRemoteFeatures: Partial<RemoteFeatures>) => void
  subscribeRemoteFeatures: (
    callback: (newState: RemoteFeatures | undefined) => void
  ) => () => void
}

type EmbeddedAuthProvider = {
  init?: () => Promise<void> | void
}

type EmbeddedAuthConnector = {
  provider?: EmbeddedAuthProvider
  getProvider?: () => Promise<EmbeddedAuthProvider> | EmbeddedAuthProvider
}

let appKitReadyPromise: Promise<boolean> | null = null

function timeoutPromise(ms: number) {
  return new Promise<false>((resolve) => {
    window.setTimeout(() => resolve(false), ms)
  })
}

function hasReadyAppKitAuthUi() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    hasAppKitAuthConnector() &&
    hasRequiredAuthFeatures(OptionsController.state.remoteFeatures) &&
    ChainController.state.noAdapters !== true
  )
}

export function installAppKitReadyWait(appKit: Pick<AppKitAuthFeatureClient, 'ready'>) {
  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }

  markAppKitReadyDebugInstalled()
  logAuthBootDebug('appkit-ready-wait-installed')

  appKitReadyPromise = Promise.resolve()
    .then(() => appKit.ready?.())
    .then(() => {
      markAppKitReadyDebugSettled(true)
      logAuthBootDebug('appkit-ready-resolved')
      return true
    })
    .catch((error) => {
      console.warn('[AppKit] Initialization did not finish before auth modal prep:', error)
      markAppKitReadyDebugSettled(false, error)
      logAuthBootDebug('appkit-ready-rejected', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    })

  return appKitReadyPromise
}

export async function waitForAppKitReady(timeoutMs = APPKIT_READY_TIMEOUT_MS) {
  if (typeof window === 'undefined') {
    return false
  }

  if (!appKitReadyPromise) {
    return true
  }

  const result = await Promise.race([appKitReadyPromise, timeoutPromise(timeoutMs)])
  logAuthBootDebug('appkit-ready-wait-finished', {
    result,
    timeoutMs,
  })
  return result
}

export async function waitForAppKitAuthUi(
  timeoutMs = AUTH_UI_READY_TIMEOUT_MS
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false
  }

  logAuthBootDebug('auth-ui-wait-start', {
    timeoutMs,
  })

  const appKitIsReady = await waitForAppKitReady(APPKIT_READY_TIMEOUT_MS)

  if (hasReadyAppKitAuthUi()) {
    logAuthBootDebug('auth-ui-wait-finished', {
      result: true,
      reason: 'already-ready',
      appKitIsReady,
      timeoutMs,
    })
    return true
  }

  // On iOS standalone cold starts, AppKit's ready() can lag behind auth
  // connector and remote-feature registration. Keep watching those inputs
  // instead of opening a wallet-only modal as soon as ready() misses its budget.
  return new Promise((resolve) => {
    let settled = false
    const unsubscribers: Array<() => void> = []

    const finish = (isReady: boolean) => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      logAuthBootDebug('auth-ui-wait-finished', {
        result: isReady,
        reason: isReady ? 'controller-ready' : 'timeout',
        appKitIsReady,
        timeoutMs,
      })
      resolve(isReady)
    }

    const checkReady = () => {
      if (hasReadyAppKitAuthUi()) {
        finish(true)
      }
    }

    const timeoutId = window.setTimeout(() => finish(false), timeoutMs)

    unsubscribers.push(
      ConnectorController.subscribeKey('connectors', checkReady),
      OptionsController.subscribeKey('remoteFeatures', checkReady),
      ChainController.subscribeKey('noAdapters', checkReady),
      ChainController.subscribeKey('activeChain', checkReady)
    )

    checkReady()
  })
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

  logAuthBootDebug('clear-stale-appkit-auth-session-start')

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
    logAuthBootDebug('clear-stale-appkit-auth-session-error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  logAuthBootDebug('clear-stale-appkit-auth-session-finished')
}

function hasStoredEmbeddedAuthSession() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(`${APPKIT_WALLET_STORAGE_PREFIX}EMAIL_LOGIN_USED_KEY`) === 'true'
  } catch {
    return false
  }
}

async function getEmbeddedAuthProvider() {
  const connector = ConnectorController.getAuthConnector() as EmbeddedAuthConnector | undefined
  if (!connector) {
    return undefined
  }

  if (connector.provider) {
    return connector.provider
  }

  return connector.getProvider?.()
}

export function hasAppKitAuthConnector() {
  if (typeof window === 'undefined') {
    return false
  }

  return Boolean(ConnectorController.getAuthConnector())
}

export function waitForAppKitAuthConnector(
  timeoutMs = AUTH_CONNECTOR_READY_TIMEOUT_MS
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }

  if (hasAppKitAuthConnector()) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (isReady: boolean) => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timeoutId)
      unsubscribeConnectors()
      resolve(isReady)
    }

    const timeoutId = window.setTimeout(() => finish(false), timeoutMs)
    const unsubscribeConnectors = ConnectorController.subscribeKey('connectors', () => {
      if (hasAppKitAuthConnector()) {
        finish(true)
      }
    })
  })
}

let embeddedAuthWarmupPromise: Promise<boolean> | null = null

export function warmAppKitEmbeddedAuthFrame(): Promise<boolean> {
  if (typeof window === 'undefined' || !hasStoredEmbeddedAuthSession()) {
    logAuthBootDebug('embedded-auth-warmup-skipped', {
      reason: typeof window === 'undefined' ? 'server' : 'no-stored-session',
    })
    return Promise.resolve(false)
  }

  logAuthBootDebug('embedded-auth-warmup-start')

  embeddedAuthWarmupPromise ??= (async () => {
    const provider = await getEmbeddedAuthProvider()
    if (!provider?.init) {
      // The auth connector registers asynchronously after createAppKit returns,
      // so it is usually missing on the first call. Reset the cache so the
      // connector-change subscription (and signIn) can retry once it exists,
      // instead of pinning a permanent "not warmed" result.
      embeddedAuthWarmupPromise = null
      logAuthBootDebug('embedded-auth-warmup-finished', {
        result: false,
        reason: 'provider-init-missing',
      })
      return false
    }

    await provider.init()
    logAuthBootDebug('embedded-auth-warmup-finished', {
      result: true,
    })
    return true
  })().catch((error) => {
    embeddedAuthWarmupPromise = null
    console.warn('[AppKit] Failed to warm embedded auth frame:', error)
    logAuthBootDebug('embedded-auth-warmup-error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  })

  return embeddedAuthWarmupPromise
}

export function installAppKitEmbeddedAuthFrameWarmup() {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  logAuthBootDebug('embedded-auth-warmup-installed')
  void warmAppKitEmbeddedAuthFrame()

  const unsubscribeConnectors = ConnectorController.subscribeKey('connectors', () => {
    logAuthBootDebug('connectors-changed')
    void warmAppKitEmbeddedAuthFrame()
  })

  return unsubscribeConnectors
}

function recoverAppKitAuthFeatures(
  appKit: AppKitAuthFeatureClient,
  remoteFeatures: RemoteFeatures | undefined
) {
  logAuthBootDebug('recover-appkit-auth-features-start', {
    remoteFeatures,
  })
  clearStaleAppKitAuthSession()
  appKit.updateRemoteFeatures(requiredAuthFeaturePatch(remoteFeatures))
  logAuthBootDebug('recover-appkit-auth-features-finished')
}

export function installAppKitAuthFeatureGuard(appKit: AppKitAuthFeatureClient) {
  const applyRequiredAuthFeatures = (remoteFeatures: RemoteFeatures | undefined) => {
    if (hasRequiredAuthFeatures(remoteFeatures)) {
      logAuthBootDebug('auth-feature-guard-ok', {
        remoteFeatures,
      })
      return
    }

    logAuthBootDebug('auth-feature-guard-patching', {
      remoteFeatures,
      patch: requiredAuthFeaturePatch(remoteFeatures),
    })
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
