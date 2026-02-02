'use client'

import { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { mainnet } from '@reown/appkit/networks'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'
import { wagmiAdapter, projectId, networks } from '@/lib/wagmi-config'

const queryClient = new QueryClient()

const metadata = {
  name: 'WordLink',
  description: 'Learn Czech and Vietnamese with spaced repetition',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://wordlink.app',
  icons: [],
}

createAppKit({
  adapters: [wagmiAdapter],
  projectId: projectId!,
  networks: [mainnet],
  defaultNetwork: mainnet,
  metadata,
  features: {
    email: true,
    socials: ['google'],
    emailShowWallets: false,
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
