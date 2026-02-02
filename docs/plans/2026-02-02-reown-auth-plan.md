# Reown AppKit Authentication - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add email/Google login via Reown AppKit so users can optionally authenticate and sync progress across devices, while preserving anonymous (device_id) usage.

**Architecture:** Reown AppKit provides the login modal. Anonymous users keep their device_id identity. On sign-in, the wallet address (created behind the scenes by Reown) is linked to the user record. If the wallet was already linked to another user (cross-device), progress is auto-merged (highest stage wins). Supabase PostgreSQL remains the data store.

**Tech Stack:** Next.js 15, React 19, @reown/appkit, @reown/appkit-adapter-wagmi, wagmi, viem, @tanstack/react-query, Vitest

**Worktree:** `.worktrees/reown-auth` on branch `feature/reown-auth`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Reown AppKit + wagmi packages**

Run (from worktree root):
```bash
cd /Users/janmiksik/Desktop/projects/own/+/lang-learning-app/wordlink/.worktrees/reown-auth
pnpm add @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
```

Expected: packages added to `dependencies` in package.json

**Step 2: Install Vitest + testing utilities**

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: packages added to `devDependencies`

**Step 3: Verify the build still passes**

```bash
pnpm run build
```

Expected: Build succeeds (no regressions from new deps)

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add reown appkit, wagmi, vitest dependencies"
```

---

## Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add test script)
- Create: `lib/__tests__/setup.ts`

**Step 1: Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./lib/__tests__/setup.ts'],
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

**Step 2: Create test setup file**

Create `lib/__tests__/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

**Step 3: Add test script to package.json**

Add to `"scripts"` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Create a smoke test to verify setup**

Create `lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

**Step 5: Run tests**

```bash
pnpm test
```

Expected: 1 test passing

**Step 6: Commit**

```bash
git add vitest.config.ts lib/__tests__/setup.ts lib/__tests__/smoke.test.ts package.json
git commit -m "chore: configure vitest with jsdom environment"
```

---

## Task 3: Create Wagmi + Reown AppKit Config

**Files:**
- Create: `lib/wagmi-config.ts`
- Modify: `.env.local` (add NEXT_PUBLIC_REOWN_PROJECT_ID)

**Step 1: Add project ID to environment**

The user needs a Reown project ID from https://cloud.reown.com/. Add to `.env.local`:
```
NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_here
```

**Step 2: Create wagmi config**

Create `lib/wagmi-config.ts`:
```ts
import { cookieStorage, createStorage } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet } from '@reown/appkit/networks'

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID

if (!projectId) {
  throw new Error('NEXT_PUBLIC_REOWN_PROJECT_ID is not set')
}

export const networks = [mainnet] as const

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks,
})

export const wagmiConfig = wagmiAdapter.wagmiConfig
```

Note: We use `mainnet` as the network since Reown needs at least one chain configured, but the user won't interact with any blockchain directly - this is just for the embedded wallet infrastructure that powers email/social login.

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to wagmi-config.ts

**Step 4: Commit**

```bash
git add lib/wagmi-config.ts
git commit -m "feat: add wagmi + reown appkit configuration"
```

---

## Task 4: Create AppKit Context Provider

**Files:**
- Create: `components/AppKitProvider.tsx`

**Step 1: Create the provider component**

Create `components/AppKitProvider.tsx`:
```tsx
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
  networks: [...networks],
  defaultNetwork: mainnet,
  metadata,
  features: {
    email: true,
    socials: ['google'],
    emailShowWallets: false, // Hide wallet options initially - email/Google only
  },
  allWallets: 'HIDE', // Hide external wallets for now - can enable later
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
```

Key decisions:
- `emailShowWallets: false` hides wallet options since we want email/Google only for now
- `allWallets: 'HIDE'` keeps the UI simple - can be changed to `'SHOW'` later for wallet support
- `socials: ['google']` enables Google social login alongside email
- Cookie-based initial state prevents hydration mismatches with SSR

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add components/AppKitProvider.tsx
git commit -m "feat: add AppKit context provider with email + google login"
```

---

## Task 5: Integrate Provider into Layout

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Update layout.tsx to wrap children with AppKitProvider**

The current `app/layout.tsx` is:
```tsx
import type { Metadata } from 'next';
import './globals.css';
import './.generated/tailwind.css';

export const metadata: Metadata = {
  title: 'Language Helper',
  description: 'Learn Czech and Vietnamese with spaced repetition',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Replace with:
```tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppKitProvider } from '@/components/AppKitProvider';
import './globals.css';
import './.generated/tailwind.css';

export const metadata: Metadata = {
  title: 'Language Helper',
  description: 'Learn Czech and Vietnamese with spaced repetition',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const cookies = headersList.get('cookie');

  return (
    <html lang="en">
      <body>
        <AppKitProvider cookies={cookies}>
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}
```

Changes: Made the function `async`, imported `headers()` for SSR cookie hydration, wrapped children with `AppKitProvider`.

**Step 2: Verify the build passes**

```bash
pnpm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wrap app in AppKit provider for auth support"
```

---

## Task 6: Create useAuth Hook

**Files:**
- Create: `hooks/useAuth.ts`
- Create: `hooks/__tests__/useAuth.test.ts`

**Step 1: Write the test first**

Create `hooks/__tests__/useAuth.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Reown/wagmi hooks before importing useAuth
const mockOpen = vi.fn()
const mockDisconnect = vi.fn()
let mockIsConnected = false
let mockAddress: string | undefined = undefined
let mockEmbeddedWalletInfo: { email?: string } | undefined = undefined

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: mockOpen }),
  useAppKitAccount: () => ({
    isConnected: mockIsConnected,
    address: mockAddress,
    embeddedWalletInfo: mockEmbeddedWalletInfo,
  }),
  useDisconnect: () => ({ disconnect: mockDisconnect }),
}))

// Must import after mocks
import { useAuth } from '../useAuth'
import { renderHook } from '@testing-library/react'

describe('useAuth', () => {
  beforeEach(() => {
    mockIsConnected = false
    mockAddress = undefined
    mockEmbeddedWalletInfo = undefined
    vi.clearAllMocks()
  })

  it('returns disconnected state by default', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBeUndefined()
    expect(result.current.email).toBeUndefined()
  })

  it('returns connected state with address', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    const { result } = renderHook(() => useAuth())
    expect(result.current.isConnected).toBe(true)
    expect(result.current.address).toBe('0xABC123')
  })

  it('returns email from embedded wallet info', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    mockEmbeddedWalletInfo = { email: 'user@example.com' }
    const { result } = renderHook(() => useAuth())
    expect(result.current.email).toBe('user@example.com')
  })

  it('signIn calls appKit.open', () => {
    const { result } = renderHook(() => useAuth())
    result.current.signIn()
    expect(mockOpen).toHaveBeenCalled()
  })

  it('signOut calls disconnect', () => {
    const { result } = renderHook(() => useAuth())
    result.current.signOut()
    expect(mockDisconnect).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- hooks/__tests__/useAuth.test.ts
```

Expected: FAIL - "Cannot find module '../useAuth'"

**Step 3: Implement useAuth hook**

Create `hooks/useAuth.ts`:
```ts
'use client'

import { useCallback } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'

export function useAuth() {
  const { open } = useAppKit()
  const { isConnected, address, embeddedWalletInfo } = useAppKitAccount()
  const { disconnect } = useDisconnect()

  const signIn = useCallback(() => {
    open()
  }, [open])

  const signOut = useCallback(() => {
    disconnect()
  }, [disconnect])

  return {
    isConnected,
    address,
    email: embeddedWalletInfo?.email,
    signIn,
    signOut,
  }
}
```

**Step 4: Run tests**

```bash
pnpm test -- hooks/__tests__/useAuth.test.ts
```

Expected: All 5 tests passing

**Step 5: Commit**

```bash
git add hooks/useAuth.ts hooks/__tests__/useAuth.test.ts
git commit -m "feat: add useAuth hook wrapping Reown AppKit"
```

---

## Task 7: Write Wallet-Link Merge Logic (Server-Side)

**Files:**
- Modify: `lib/db/queries/users.ts` (replace simple `linkWalletToUser` with merge-aware version)
- Create: `lib/db/queries/__tests__/link-wallet.test.ts`

**Step 1: Write the test first**

Create `lib/db/queries/__tests__/link-wallet.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the pure merge logic function, not the DB calls directly.
// The DB calls will be tested via API integration tests.
import { mergeUserData, type MergeInput } from '../users'

describe('mergeUserData', () => {
  it('merges progress keeping highest stageIndex per word', () => {
    const input: MergeInput = {
      sourceProgress: {
        w001: { stageIndex: 3, knownCount: 5, unknownCount: 1, lastKnownAt: new Date('2026-01-15'), lastUnknownAt: null, nextDueAt: new Date('2026-01-20') },
        w002: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: new Date('2026-01-10'), lastUnknownAt: null, nextDueAt: new Date('2026-01-11') },
      },
      targetProgress: {
        w001: { stageIndex: 5, knownCount: 8, unknownCount: 2, lastKnownAt: new Date('2026-01-20'), lastUnknownAt: new Date('2026-01-18'), nextDueAt: new Date('2026-01-25') },
        w003: { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: new Date('2026-01-12'), lastUnknownAt: null, nextDueAt: new Date('2026-01-14') },
      },
      sourceHooks: { w001: 'source hook for w001', w002: 'source hook for w002' },
      targetHooks: { w001: 'target hook for w001' },
      sourceFilters: ['basic', 'food'],
      targetFilters: ['basic', 'travel'],
    }

    const result = mergeUserData(input)

    // w001: target wins (stageIndex 5 > 3)
    expect(result.mergedProgress.w001.stageIndex).toBe(5)
    expect(result.mergedProgress.w001.knownCount).toBe(8)

    // w002: only in source, keep as-is
    expect(result.mergedProgress.w002.stageIndex).toBe(1)

    // w003: only in target, keep as-is
    expect(result.mergedProgress.w003.stageIndex).toBe(2)

    // Hooks: target wins for w001 (already has one), source w002 is new
    expect(result.mergedHooks.w001).toBe('target hook for w001')
    expect(result.mergedHooks.w002).toBe('source hook for w002')

    // Filters: union
    expect(result.mergedFilters.sort()).toEqual(['basic', 'food', 'travel'])
  })

  it('source wins when it has higher stageIndex', () => {
    const input: MergeInput = {
      sourceProgress: {
        w001: { stageIndex: 7, knownCount: 10, unknownCount: 0, lastKnownAt: new Date('2026-01-20'), lastUnknownAt: null, nextDueAt: new Date('2026-02-01') },
      },
      targetProgress: {
        w001: { stageIndex: 3, knownCount: 4, unknownCount: 1, lastKnownAt: new Date('2026-01-15'), lastUnknownAt: new Date('2026-01-14'), nextDueAt: new Date('2026-01-18') },
      },
      sourceHooks: {},
      targetHooks: {},
      sourceFilters: [],
      targetFilters: [],
    }

    const result = mergeUserData(input)
    expect(result.mergedProgress.w001.stageIndex).toBe(7)
    expect(result.mergedProgress.w001.knownCount).toBe(10)
  })

  it('handles empty source gracefully', () => {
    const input: MergeInput = {
      sourceProgress: {},
      targetProgress: { w001: { stageIndex: 3, knownCount: 3, unknownCount: 0, lastKnownAt: null, lastUnknownAt: null, nextDueAt: null } },
      sourceHooks: {},
      targetHooks: { w001: 'hook' },
      sourceFilters: [],
      targetFilters: ['basic'],
    }

    const result = mergeUserData(input)
    expect(result.mergedProgress.w001.stageIndex).toBe(3)
    expect(result.mergedHooks.w001).toBe('hook')
    expect(result.mergedFilters).toEqual(['basic'])
  })

  it('handles empty target gracefully', () => {
    const input: MergeInput = {
      sourceProgress: { w001: { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: null, lastUnknownAt: null, nextDueAt: null } },
      targetProgress: {},
      sourceHooks: { w001: 'hook' },
      targetHooks: {},
      sourceFilters: ['food'],
      targetFilters: [],
    }

    const result = mergeUserData(input)
    expect(result.mergedProgress.w001.stageIndex).toBe(2)
    expect(result.mergedHooks.w001).toBe('hook')
    expect(result.mergedFilters).toEqual(['food'])
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- lib/db/queries/__tests__/link-wallet.test.ts
```

Expected: FAIL - "mergeUserData is not exported"

**Step 3: Implement the merge logic**

Add to `lib/db/queries/users.ts` (at the end, before the `deleteUser` function):

```ts
// --- Merge logic for wallet linking ---

export interface ProgressMergeItem {
  stageIndex: number
  knownCount: number
  unknownCount: number
  lastKnownAt: Date | null
  lastUnknownAt: Date | null
  nextDueAt: Date | null
}

export interface MergeInput {
  sourceProgress: Record<string, ProgressMergeItem>
  targetProgress: Record<string, ProgressMergeItem>
  sourceHooks: Record<string, string>
  targetHooks: Record<string, string>
  sourceFilters: string[]
  targetFilters: string[]
}

export interface MergeResult {
  mergedProgress: Record<string, ProgressMergeItem>
  mergedHooks: Record<string, string>
  mergedFilters: string[]
}

/** Pure function: merge two users' data. Highest stageIndex wins per word. */
export function mergeUserData(input: MergeInput): MergeResult {
  const { sourceProgress, targetProgress, sourceHooks, targetHooks, sourceFilters, targetFilters } = input

  // Merge progress: highest stageIndex wins
  const mergedProgress: Record<string, ProgressMergeItem> = { ...targetProgress }
  for (const [wordId, sourceItem] of Object.entries(sourceProgress)) {
    const targetItem = mergedProgress[wordId]
    if (!targetItem || sourceItem.stageIndex > targetItem.stageIndex) {
      mergedProgress[wordId] = sourceItem
    }
  }

  // Merge hooks: target wins on conflict, source fills gaps
  const mergedHooks: Record<string, string> = { ...sourceHooks, ...targetHooks }

  // Merge filters: union
  const mergedFilters = [...new Set([...targetFilters, ...sourceFilters])]

  return { mergedProgress, mergedHooks, mergedFilters }
}
```

**Step 4: Run tests**

```bash
pnpm test -- lib/db/queries/__tests__/link-wallet.test.ts
```

Expected: All 4 tests passing

**Step 5: Commit**

```bash
git add lib/db/queries/users.ts lib/db/queries/__tests__/link-wallet.test.ts
git commit -m "feat: add pure merge logic for wallet-linking user data"
```

---

## Task 8: Create Link-Wallet API Endpoint

**Files:**
- Create: `app/api/auth/link-wallet/route.ts`

**Step 1: Create the API endpoint**

Create `app/api/auth/link-wallet/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import {
  getUserByDeviceId,
  getUserByWalletAddress,
  linkWalletToUser,
  mergeUserData,
  deleteUser,
} from '@/lib/db'
import {
  getUserProgress,
  batchUpsertProgress,
} from '@/lib/db/queries/progress'
import {
  getUserMemoryHooks,
  batchUpsertMemoryHooks,
} from '@/lib/db/queries/memory-hooks'
import {
  getUserCategoryFilters,
  setUserCategoryFilters,
} from '@/lib/db/queries/category-filters'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

interface LinkWalletRequest {
  deviceId: string
  walletAddress: string
}

export async function POST(request: NextRequest) {
  try {
    const body: LinkWalletRequest = await request.json()
    const { deviceId, walletAddress } = body

    if (!deviceId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'deviceId and walletAddress are required' },
        { status: 400 }
      )
    }

    // Find the current anonymous user by device ID
    const currentUser = await getUserByDeviceId(deviceId)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'No user found for this device' },
        { status: 404 }
      )
    }

    // Check if wallet is already linked to the same user
    if (currentUser.walletAddress === walletAddress) {
      // Already linked - return current data
      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(currentUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserCategoryFilters(currentUser.id),
      ])

      return NextResponse.json({
        success: true,
        user: {
          id: currentUser.id,
          role: currentUser.role,
          show_english: currentUser.showEnglish ?? true,
          show_category_badges: currentUser.showCategoryBadges ?? false,
        },
        progress,
        memory_hooks: hooks,
        category_filters: filters,
      })
    }

    // Check if wallet is linked to a different user (cross-device merge case)
    const existingWalletUser = await getUserByWalletAddress(walletAddress)

    if (!existingWalletUser) {
      // Case 1: Fresh link - just add wallet to current user
      await linkWalletToUser(currentUser.id, walletAddress)

      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(currentUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserCategoryFilters(currentUser.id),
      ])

      return NextResponse.json({
        success: true,
        user: {
          id: currentUser.id,
          role: currentUser.role,
          show_english: currentUser.showEnglish ?? true,
          show_category_badges: currentUser.showCategoryBadges ?? false,
        },
        progress,
        memory_hooks: hooks,
        category_filters: filters,
      })
    }

    // Case 2: Wallet already linked to another user - merge
    const [sourceProgress, targetProgress, sourceHooksRaw, targetHooksRaw, sourceFilters, targetFilters] =
      await Promise.all([
        getUserProgress(currentUser.id),
        getUserProgress(existingWalletUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserMemoryHooks(existingWalletUser.id),
        getUserCategoryFilters(currentUser.id),
        getUserCategoryFilters(existingWalletUser.id),
      ])

    // Convert progress records to merge-compatible format
    const toMergeItem = (p: Record<string, { stageIndex: number; knownCount: number; unknownCount: number; lastKnownAt: Date | null; lastUnknownAt: Date | null; nextDueAt: Date | null }>) => {
      const result: Record<string, { stageIndex: number; knownCount: number; unknownCount: number; lastKnownAt: Date | null; lastUnknownAt: Date | null; nextDueAt: Date | null }> = {}
      for (const [wordId, item] of Object.entries(p)) {
        result[wordId] = {
          stageIndex: item.stageIndex,
          knownCount: item.knownCount,
          unknownCount: item.unknownCount,
          lastKnownAt: item.lastKnownAt,
          lastUnknownAt: item.lastUnknownAt,
          nextDueAt: item.nextDueAt,
        }
      }
      return result
    }

    const merged = mergeUserData({
      sourceProgress: toMergeItem(sourceProgress),
      targetProgress: toMergeItem(targetProgress),
      sourceHooks: sourceHooksRaw,
      targetHooks: targetHooksRaw,
      sourceFilters,
      targetFilters,
    })

    // Apply merged progress to target user
    const progressToUpsert = Object.entries(merged.mergedProgress).map(
      ([wordId, item]) => ({
        userId: existingWalletUser.id,
        wordId,
        stageIndex: item.stageIndex,
        knownCount: item.knownCount,
        unknownCount: item.unknownCount,
        lastKnownAt: item.lastKnownAt,
        lastUnknownAt: item.lastUnknownAt,
        nextDueAt: item.nextDueAt,
      })
    )
    if (progressToUpsert.length > 0) {
      await batchUpsertProgress(progressToUpsert)
    }

    // Apply merged hooks to target user
    const hooksToUpsert = Object.entries(merged.mergedHooks).map(
      ([wordId, hookText]) => ({ wordId, hookText })
    )
    if (hooksToUpsert.length > 0) {
      await batchUpsertMemoryHooks(
        existingWalletUser.id,
        hooksToUpsert.reduce((acc, { wordId, hookText }) => {
          acc[wordId] = hookText
          return acc
        }, {} as Record<string, string>)
      )
    }

    // Apply merged filters to target user
    await setUserCategoryFilters(existingWalletUser.id, merged.mergedFilters)

    // Update target user's device_id to current device
    await db
      .update(users)
      .set({ deviceId, updatedAt: new Date() })
      .where(eq(users.id, existingWalletUser.id))

    // Delete the source (anonymous) user - cascade will clean up orphaned data
    await deleteUser(currentUser.id)

    // Return merged data
    const [finalProgress, finalHooks, finalFilters] = await Promise.all([
      getUserProgress(existingWalletUser.id),
      getUserMemoryHooks(existingWalletUser.id),
      getUserCategoryFilters(existingWalletUser.id),
    ])

    return NextResponse.json({
      success: true,
      merged: true,
      user: {
        id: existingWalletUser.id,
        role: existingWalletUser.role,
        show_english: existingWalletUser.showEnglish ?? true,
        show_category_badges: existingWalletUser.showCategoryBadges ?? false,
      },
      progress: finalProgress,
      memory_hooks: finalHooks,
      category_filters: finalFilters,
    })
  } catch (error) {
    console.error('Link wallet error:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to link wallet'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
```

Note: This endpoint depends on `batchUpsertMemoryHooks` which may not exist yet. Check `lib/db/queries/memory-hooks.ts` - if it doesn't have a batch function, you'll need to add one similar to `batchUpsertProgress`. A simple implementation:

```ts
// Add to lib/db/queries/memory-hooks.ts if not present:
export async function batchUpsertMemoryHooks(
  userId: string,
  hooks: Record<string, string>
): Promise<void> {
  for (const [wordId, hookText] of Object.entries(hooks)) {
    await upsertMemoryHook(userId, wordId, hookText)
  }
}
```

**Step 2: Verify build passes**

```bash
pnpm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/api/auth/link-wallet/route.ts lib/db/queries/memory-hooks.ts
git commit -m "feat: add POST /api/auth/link-wallet endpoint with merge logic"
```

---

## Task 9: Create AuthButton Component

**Files:**
- Create: `components/AuthButton.tsx`

**Step 1: Create the component**

Create `components/AuthButton.tsx`:
```tsx
'use client'

import { useAuth } from '@/hooks/useAuth'

export function AuthButton() {
  const { isConnected, email, address, signIn, signOut } = useAuth()

  if (isConnected) {
    const displayName = email || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected')
    return (
      <button
        onClick={signOut}
        className="auth-button is-connected"
        title={`Signed in as ${displayName}. Click to sign out.`}
      >
        <span className="auth-dot" />
        <span className="auth-label">{displayName}</span>
      </button>
    )
  }

  return (
    <button
      onClick={signIn}
      className="auth-button"
      title="Sign in to sync across devices"
    >
      Sign in
    </button>
  )
}
```

**Step 2: Add styles**

Add to `styles.css` (or the appropriate stylesheet):
```css
.auth-button {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-subtle);
  background: var(--background-elevated);
  color: var(--text);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.auth-button:hover {
  background: var(--background-hover, var(--background-elevated));
  border-color: var(--accent);
}

.auth-button.is-connected {
  border-color: var(--accent);
}

.auth-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--accent);
}

.auth-label {
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors

**Step 4: Commit**

```bash
git add components/AuthButton.tsx styles.css
git commit -m "feat: add AuthButton component for sign-in/sign-out"
```

---

## Task 10: Wire Auth into App UI

**Files:**
- Modify: `app/page.tsx` (add AuthButton to header area)
- Modify: `components/SettingsPanel.tsx` (show auth status)

**Step 1: Add AuthButton to the main page header**

Find the header/toolbar area in `app/page.tsx` and add the `<AuthButton />` component. The exact location depends on the current layout - place it near the settings gear button.

Import at the top:
```tsx
import { AuthButton } from '@/components/AuthButton'
```

Add `<AuthButton />` in the toolbar/header area alongside existing buttons.

**Step 2: Update SettingsPanel with auth info**

Modify `components/SettingsPanel.tsx` to accept and display auth props:

Add to the `SettingsPanelProps` interface:
```ts
isAuthenticated?: boolean
authEmail?: string
authAddress?: string
onSignOut?: () => void
```

Add a new section before the User ID section:
```tsx
{/* Account Section */}
<div className="mt-6 pt-6 border-t border-border-subtle">
  <p className="m-0 mb-1 text-[0.78rem] text-text-soft mb-2">Account</p>
  {isAuthenticated ? (
    <div className="flex flex-col gap-2">
      <code className="block text-xs text-text-soft break-all font-mono">
        {authEmail || authAddress || 'Connected'}
      </code>
      {onSignOut && (
        <button
          onClick={onSignOut}
          className="text-xs text-text-soft underline cursor-pointer bg-transparent border-none p-0 text-left hover:text-text"
        >
          Sign out
        </button>
      )}
    </div>
  ) : (
    <p className="text-xs text-text-soft">Not signed in</p>
  )}
</div>
```

**Step 3: Verify build passes**

```bash
pnpm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/page.tsx components/SettingsPanel.tsx
git commit -m "feat: integrate auth button into app UI and settings panel"
```

---

## Task 11: Wire useAppState to Link Wallet on Connect

**Files:**
- Modify: `hooks/useAppState.ts`
- Modify: `lib/sync.ts` (add linkWallet function)

**Step 1: Add linkWallet to sync utilities**

Add to `lib/sync.ts`:
```ts
/** Link a wallet address to the current device user. */
export async function linkWallet(walletAddress: string): Promise<SyncResponse> {
  const deviceId = getDeviceId()

  const response = await fetch('/api/auth/link-wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, walletAddress }),
  })

  if (!response.ok) {
    throw new Error(`Failed to link wallet: ${response.statusText}`)
  }

  const result = await response.json()
  if (result.user?.id) lastKnownUserId = result.user.id
  return result
}
```

**Step 2: Add wallet connection effect to useAppState**

In `hooks/useAppState.ts`, the hook needs to accept an optional `walletAddress` parameter and trigger linking when it changes from null to a value.

Add a new parameter to the hook:
```ts
export function useAppState(words: NormalizedWord[], walletAddress?: string | undefined) {
```

Add a new effect after the existing sync effects:
```ts
// Link wallet when user connects
const hasLinkedRef = useRef(false)
useEffect(() => {
  if (!isHydrated || !walletAddress || hasLinkedRef.current) return
  hasLinkedRef.current = true

  linkWallet(walletAddress)
    .then((serverData) => {
      isUpdatingFromServerRef.current = true

      // Refresh state from server after merge
      if (serverData.progress && Object.keys(serverData.progress).length > 0) {
        const next: Record<string, ProgressData> = {}
        for (const [wordId, p] of Object.entries(serverData.progress)) {
          next[wordId] = {
            stageIndex: p.stageIndex,
            knownCount: p.knownCount,
            unknownCount: p.unknownCount,
            lastKnownAt: p.lastKnownAt ? new Date(p.lastKnownAt).getTime() : undefined,
            lastUnknownAt: p.lastUnknownAt ? new Date(p.lastUnknownAt).getTime() : undefined,
            nextDueAt: p.nextDueAt ? new Date(p.nextDueAt).getTime() : undefined,
          }
        }
        setProgress(next)
      }
      if (serverData.memory_hooks) setMemoryHooks(serverData.memory_hooks)
      if (serverData.category_filters) setSelectedCategories(new Set(serverData.category_filters))
      if (serverData.user?.id) setUserId(serverData.user.id)
      if (serverData.user?.role) setRole(serverData.user.role)

      requestAnimationFrame(() => {
        isUpdatingFromServerRef.current = false
      })
    })
    .catch((err) => {
      console.error('[useAppState] Failed to link wallet:', err)
      hasLinkedRef.current = false // Allow retry
    })
}, [isHydrated, walletAddress])
```

Don't forget to import `linkWallet` from `@/lib/sync`.

**Step 3: Update app/page.tsx to pass walletAddress**

In `app/page.tsx`, import `useAuth` and pass the address to `useAppState`:
```tsx
const { address: walletAddress } = useAuth()
const state = useAppState(normalizedWords, walletAddress)
```

**Step 4: Reset hasLinkedRef on disconnect**

Add another effect to reset the linked ref when wallet disconnects:
```ts
useEffect(() => {
  if (!walletAddress) {
    hasLinkedRef.current = false
  }
}, [walletAddress])
```

**Step 5: Verify build passes**

```bash
pnpm run build
```

Expected: Build succeeds

**Step 6: Commit**

```bash
git add hooks/useAppState.ts lib/sync.ts app/page.tsx
git commit -m "feat: auto-link wallet and refresh state on sign-in"
```

---

## Task 12: Write Integration Tests for Link-Wallet API

**Files:**
- Create: `app/api/auth/__tests__/link-wallet.test.ts`

**Step 1: Write API integration tests**

Create `app/api/auth/__tests__/link-wallet.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database modules
const mockGetUserByDeviceId = vi.fn()
const mockGetUserByWalletAddress = vi.fn()
const mockLinkWalletToUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockMergeUserData = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertMemoryHooks = vi.fn()
const mockSetUserCategoryFilters = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserByDeviceId: (...args: unknown[]) => mockGetUserByDeviceId(...args),
  getUserByWalletAddress: (...args: unknown[]) => mockGetUserByWalletAddress(...args),
  linkWalletToUser: (...args: unknown[]) => mockLinkWalletToUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  mergeUserData: (...args: unknown[]) => mockMergeUserData(...args),
}))

vi.mock('@/lib/db/queries/progress', () => ({
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
}))

vi.mock('@/lib/db/queries/memory-hooks', () => ({
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  batchUpsertMemoryHooks: (...args: unknown[]) => mockBatchUpsertMemoryHooks(...args),
}))

vi.mock('@/lib/db/queries/category-filters', () => ({
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
}))

vi.mock('@/lib/db/client', () => ({
  db: { update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }) },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  users: {},
}))

import { POST } from '../../auth/link-wallet/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/auth/link-wallet', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/link-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
  })

  it('returns 400 if deviceId missing', async () => {
    const res = await POST(makeRequest({ walletAddress: '0xABC' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
  })

  it('returns 400 if walletAddress missing', async () => {
    const res = await POST(makeRequest({ deviceId: 'dev-123' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
  })

  it('returns 404 if device has no user', async () => {
    mockGetUserByDeviceId.mockResolvedValue(null)
    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.success).toBe(false)
  })

  it('fresh link: adds wallet to current user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    mockGetUserByDeviceId.mockResolvedValue(user)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockLinkWalletToUser.mockResolvedValue({ ...user, walletAddress: '0xABC' })

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(mockLinkWalletToUser).toHaveBeenCalledWith('uuid-A', '0xABC')
  })

  it('idempotent: returns data if wallet already linked to same user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: '0xABC', role: 'vi', showEnglish: true, showCategoryBadges: false }
    mockGetUserByDeviceId.mockResolvedValue(user)

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockLinkWalletToUser).not.toHaveBeenCalled() // No update needed
  })

  it('merge: merges users when wallet belongs to different user', async () => {
    const currentUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const existingUser = { id: 'uuid-B', deviceId: 'dev-456', walletAddress: '0xABC', role: 'cz', showEnglish: false, showCategoryBadges: true }

    mockGetUserByDeviceId.mockResolvedValue(currentUser)
    mockGetUserByWalletAddress.mockResolvedValue(existingUser)
    mockMergeUserData.mockReturnValue({
      mergedProgress: {},
      mergedHooks: {},
      mergedFilters: [],
    })

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.merged).toBe(true)
    expect(data.user.id).toBe('uuid-B') // Switched to wallet owner
    expect(mockDeleteUser).toHaveBeenCalledWith('uuid-A') // Old user deleted
    expect(mockMergeUserData).toHaveBeenCalled()
  })
})
```

**Step 2: Run the tests**

```bash
pnpm test -- app/api/auth/__tests__/link-wallet.test.ts
```

Expected: All 6 tests passing

**Step 3: Commit**

```bash
git add app/api/auth/__tests__/link-wallet.test.ts
git commit -m "test: add integration tests for link-wallet API endpoint"
```

---

## Task 13: Write Sync API Regression Tests

**Files:**
- Create: `app/api/sync/__tests__/sync.test.ts`

**Step 1: Write regression tests verifying sync still works for anonymous users**

Create `app/api/sync/__tests__/sync.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolveUser = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockUpdateUserRole = vi.fn()
const mockUpdateUserPreferences = vi.fn()
const mockUpsertMemoryHook = vi.fn()
const mockDeleteMemoryHook = vi.fn()
const mockSetUserCategoryFilters = vi.fn()

vi.mock('@/lib/db', () => ({
  getOrCreateUserByDeviceId: vi.fn(),
  getUserById: vi.fn(),
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  upsertMemoryHook: (...args: unknown[]) => mockUpsertMemoryHook(...args),
  deleteMemoryHook: (...args: unknown[]) => mockDeleteMemoryHook(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  updateUserRole: (...args: unknown[]) => mockUpdateUserRole(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
}))

vi.mock('@/lib/db/client', () => ({
  db: { update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) }) },
}))

vi.mock('@/lib/db/schema', () => ({
  users: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

// Re-mock to control resolveUser behavior
const mockGetOrCreateUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()

vi.mock('@/lib/db', async () => {
  return {
    getOrCreateUserByDeviceId: (...args: unknown[]) => mockGetOrCreateUserByDeviceId(...args),
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
    getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
    batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
    getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
    upsertMemoryHook: (...args: unknown[]) => mockUpsertMemoryHook(...args),
    deleteMemoryHook: (...args: unknown[]) => mockDeleteMemoryHook(...args),
    getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
    setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
    updateUserRole: (...args: unknown[]) => mockUpdateUserRole(...args),
    updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  }
})

import { GET, POST } from '../../../api/sync/route'
import { NextRequest } from 'next/server'

describe('GET /api/sync', () => {
  const baseUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, role: 'vi', showEnglish: true, showCategoryBadges: false }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
  })

  it('returns 400 if no deviceId or userId', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns user data for anonymous user', async () => {
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(data.user.role).toBe('vi')
  })
})

describe('POST /api/sync', () => {
  const baseUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, role: 'vi', showEnglish: true, showCategoryBadges: false }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
  })

  it('returns 400 if no deviceId or userId', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('syncs progress for anonymous user', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        progress: [{ word_id: 'w001', stage_index: 1, known_count: 1, unknown_count: 0, last_known_at: Date.now(), last_unknown_at: null, next_due_at: null }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockBatchUpsertProgress).toHaveBeenCalled()
  })
})
```

**Step 2: Run tests**

```bash
pnpm test -- app/api/sync/__tests__/sync.test.ts
```

Expected: All tests passing

**Step 3: Commit**

```bash
git add app/api/sync/__tests__/sync.test.ts
git commit -m "test: add regression tests for sync API with anonymous users"
```

---

## Task 14: Run All Tests + Build Verification

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests passing

**Step 2: Run full build**

```bash
pnpm run build
```

Expected: Build succeeds

**Step 3: Run lint**

```bash
pnpm lint
```

Expected: No lint errors (or only pre-existing ones)

**Step 4: Commit any fixes needed**

If tests or lint flagged issues, fix and commit:
```bash
git add -A
git commit -m "fix: address test/lint issues from auth integration"
```

---

## Task 15: Code Review Round 1

Use `superpowers:requesting-code-review` to review all changes made in this feature branch.

Focus areas:
- Security: Is the link-wallet endpoint safe from abuse? (No auth token required - acceptable since it only links, doesn't create)
- Data integrity: Does the merge logic handle all edge cases?
- UX: Does the anonymous → authenticated transition feel seamless?
- Regressions: Do all existing sync flows still work?

Fix any issues found and run tests again.

```bash
pnpm test && pnpm run build
```

Commit fixes:
```bash
git add -A
git commit -m "fix: address code review round 1 feedback"
```

---

## Task 16: Code Review Round 2

Run a second code review focusing on:
- Code style consistency with existing codebase
- Error handling completeness
- TypeScript type safety (no `any` types)
- Component props interfaces complete
- Test coverage for edge cases

Fix any issues found and run tests again.

```bash
pnpm test && pnpm run build
```

Commit fixes:
```bash
git add -A
git commit -m "fix: address code review round 2 feedback"
```

---

## Task 17: Code Review Round 3 (Final)

Final review checking:
- All tests pass
- Build succeeds
- No console errors in dev mode
- The feature is complete per the design document

```bash
pnpm test && pnpm run build && pnpm lint
```

If all green, this task is done. Use `superpowers:finishing-a-development-branch` to decide next steps (merge, PR, etc.).
