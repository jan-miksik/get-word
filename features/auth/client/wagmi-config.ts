import { cookieStorage, createStorage } from 'wagmi'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import {
  mainnet,
  polygon,
  arbitrum,
  base,
  optimism,
} from '@reown/appkit/networks'

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || ''

// Multiple EVM networks so wallet connection works regardless of which chain the user is on
export const networks = [mainnet, polygon, arbitrum, base, optimism]

// WagmiAdapter and config are created even without a project ID so the app
// can still render (anonymous mode). Auth features simply won't work until
// a valid NEXT_PUBLIC_REOWN_PROJECT_ID is set.
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks,
})

type WagmiAdapterInternals = {
  addThirdPartyConnectors: () => Promise<void>
}

const enableThirdPartyWalletConnectors =
  process.env.NEXT_PUBLIC_REOWN_THIRD_PARTY_WALLETS === 'true'

if (!enableThirdPartyWalletConnectors) {
  // AppKit auto-adds the Base Account connector, which initializes Coinbase
  // analytics on reconnect. Keep local auth wallet-only unless explicitly enabled.
  ;(wagmiAdapter as unknown as WagmiAdapterInternals).addThirdPartyConnectors = async () => {}
}

export const wagmiConfig = wagmiAdapter.wagmiConfig
