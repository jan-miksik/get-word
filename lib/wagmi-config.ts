import { cookieStorage, createStorage } from 'wagmi'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet } from '@reown/appkit/networks'

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || ''

export const networks = [mainnet]

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

export const wagmiConfig = wagmiAdapter.wagmiConfig
