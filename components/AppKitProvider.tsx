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

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: networks as unknown as [AppKitNetwork, ...AppKitNetwork[]],
  metadata,
  debug: false,
  enableAuthLogger: false,
  features: {
    email: true,
    socials: ['google', 'apple'],
    emailShowWallets: true,
    connectMethodsOrder: ['email', 'social', 'wallet'],
    collapseWallets: true,
    analytics: false,
  },
  allWallets: 'HIDE',
})

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
