'use client'

import { type ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'
import { wagmiAdapter, projectId, networks } from '@/lib/wagmi-config'

const metadata = {
  name: 'WordLink',
  description: 'Learn Czech and Vietnamese with spaced repetition',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://wordlink.app',
  icons: ['/get-word-logo.svg'],
}

const enableEmbeddedWalletAuth =
  process.env.NEXT_PUBLIC_REOWN_EMBEDDED_WALLET_AUTH === 'true'
const enableWalletAutoReconnect =
  process.env.NEXT_PUBLIC_REOWN_AUTO_RECONNECT === 'true'

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

function installTelemetryNoops() {
  if (typeof window === 'undefined') {
    return
  }

  const globalWithNoopFlag = globalThis as typeof globalThis & {
    __wordlinkTelemetryNoopsInstalled?: boolean
  }

  if (globalWithNoopFlag.__wordlinkTelemetryNoopsInstalled) {
    return
  }

  globalWithNoopFlag.__wordlinkTelemetryNoopsInstalled = true

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

const appKitConfig: AppKitConfig = {
  adapters: [wagmiAdapter],
  projectId,
  networks: networks as unknown as [AppKitNetwork, ...AppKitNetwork[]],
  metadata,
  basic: !enableEmbeddedWalletAuth,
  debug: false,
  enableCoinbase: false,
  enableEIP6963: false,
  enableReconnect: enableWalletAutoReconnect,
  enableAuthLogger: false,
  features: {
    email: enableEmbeddedWalletAuth,
    socials: enableEmbeddedWalletAuth ? ['google', 'apple'] : false,
    emailShowWallets: enableEmbeddedWalletAuth,
    connectMethodsOrder: enableEmbeddedWalletAuth ? ['email', 'social', 'wallet'] : ['wallet'],
    collapseWallets: enableEmbeddedWalletAuth,
    analytics: false,
  },
  allWallets: 'HIDE',
}

createAppKit(appKitConfig)

export function AppKitProvider({
  children,
  cookies,
}: {
  children: ReactNode
  cookies: string | null
}) {
  // Create QueryClient inside component to avoid sharing state across SSR requests
  const [queryClient] = useState(() => new QueryClient())

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
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
