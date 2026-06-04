'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'
import { wagmiAdapter, projectId, networks } from '@/features/auth/client/wagmi-config'
import {
  installAppKitAuthFeatureGuard,
  installAppKitEmbeddedAuthFrameWarmup,
  installAppKitReadyWait,
} from '@/features/auth/client/appkit-auth-features'
import { installAppKitLabelOverrides } from '@/features/auth/client/appkit-label-overrides'
import {
  MAGIC_ACCOUNT_ACCESS_DENIED_EVENT,
  isMagicAccountAccessDeniedError,
  markMagicAccountAccessDenied,
} from '@/features/auth/client/magic-rpc'
import { logAuthBootDebug } from '@/features/auth/client/auth-boot-debug'

const appUrl =
  typeof window !== 'undefined' ? window.location.origin : 'https://get-word.vercel.app'

const appIconDataUri =
  'data:image/png;base64,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'

const metadata = {
  name: 'Get Word',
  description: 'Learn any language with spaced repetition',
  url: appUrl,
  icons: [appIconDataUri],
}

const blockedTelemetryHosts = new Set([
  'browser-intake-datadoghq.com',
  'cca-lite.coinbase.com',
  'events.launchdarkly.com',
  'pulse.walletconnect.org',
])

function isBlockedTelemetryUrl(input: Parameters<typeof fetch>[0] | URL) {
  try {
    const url =
      typeof input === 'string'
        ? new URL(input, window.location.origin)
        : input instanceof URL
          ? input
          : new URL(input.url, window.location.origin)

    return blockedTelemetryHosts.has(url.hostname)
  } catch {
    return false
  }
}

function installMagicRejectionSilencer() {
  if (typeof window === 'undefined') {
    return
  }

  const globalWithFlag = globalThis as typeof globalThis & {
    __getWordMagicSilencerInstalled?: boolean
  }

  if (globalWithFlag.__getWordMagicSilencerInstalled) {
    return
  }

  globalWithFlag.__getWordMagicSilencerInstalled = true

  // The Magic SDK (used by Reown for email/social embedded wallets) rejects
  // with "User denied account access" when a persisted session can't be
  // restored. Reown doesn't catch it, so it surfaces as an unhandled
  // rejection. Let useAuth clear stale reconnect state while keeping this from
  // surfacing as an uncaught promise in the browser.
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (!isMagicAccountAccessDeniedError(event.reason)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      logAuthBootDebug('magic-account-access-denied-unhandled-rejection', {
        reason:
          event.reason instanceof Error
            ? event.reason.message
            : String(event.reason),
      })
      markMagicAccountAccessDenied()
      window.dispatchEvent(new CustomEvent(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT))
    },
    { capture: true }
  )
}

function installTelemetryNoops() {
  if (typeof window === 'undefined') {
    return
  }

  const globalWithNoopFlag = globalThis as typeof globalThis & {
    __getWordTelemetryNoopsInstalled?: boolean
  }

  if (globalWithNoopFlag.__getWordTelemetryNoopsInstalled) {
    return
  }

  globalWithNoopFlag.__getWordTelemetryNoopsInstalled = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = ((input, init) => {
    if (isBlockedTelemetryUrl(input)) {
      return Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    }

    return originalFetch(input, init)
  }) as typeof window.fetch

  const originalSendBeacon = navigator.sendBeacon?.bind(navigator)
  if (originalSendBeacon) {
    navigator.sendBeacon = ((url, data) => {
      if (isBlockedTelemetryUrl(url)) {
        return true
      }

      return originalSendBeacon(url, data)
    }) as typeof navigator.sendBeacon
  }
}

type AppKitConfig = Parameters<typeof createAppKit>[0] & {
  basic?: boolean
  enableCoinbase?: boolean
  enableReconnect?: boolean
}

installTelemetryNoops()
installMagicRejectionSilencer()

const appKitConfig: AppKitConfig = {
  adapters: [wagmiAdapter],
  projectId,
  networks: networks as unknown as [AppKitNetwork, ...AppKitNetwork[]],
  metadata,
  basic: false,
  debug: false,
  enableCoinbase: false,
  enableEIP6963: true,
  // Allow Magic/Reown to restore persisted email/social sessions. useAuth
  // bounds stale reconnects and reopens the Connect flow when Magic rejects.
  enableReconnect: true,
  enableAuthLogger: false,
  features: {
    email: true,
    socials: ['google', 'apple'],
    emailShowWallets: true,
    connectMethodsOrder: ['email', 'social', 'wallet'],
    collapseWallets: false,
    allWallets: true,
    analytics: false,
  },
  allWallets: 'SHOW',
}

const appKit = createAppKit(appKitConfig)
logAuthBootDebug('appkit-created', {
  projectIdPresent: projectId.length > 0,
  enableReconnect: appKitConfig.enableReconnect,
  features: appKitConfig.features,
})
installAppKitReadyWait(appKit)
installAppKitAuthFeatureGuard(appKit)
installAppKitEmbeddedAuthFrameWarmup()
installAppKitLabelOverrides()

export function AppKitProvider({
  children,
  cookies,
}: {
  children: ReactNode
  cookies: string | null
}) {
  // Create QueryClient inside component to avoid sharing state across SSR requests
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => {
    logAuthBootDebug('appkit-provider-mounted', {
      cookiesPresent: Boolean(cookies),
    })
  }, [cookies])

  // Cast needed: WagmiAdapter.wagmiConfig uses an internal type that is
  // structurally compatible with wagmi's Config but not nominally identical
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies
  )

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
      reconnectOnMount
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
