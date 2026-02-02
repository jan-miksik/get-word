# Reown AppKit Authentication - Design Document

## Goal

Add email/Google login to WordLink using Reown AppKit + wagmi. Users can use the app anonymously (device_id based, as today) and optionally sign in to sync progress across devices. Web3 wallet infrastructure is available for future crypto features.

## Architecture

### Auth Flow

```
User opens app → Anonymous (device_id, same as current)
              → Clicks "Sign in" → Reown AppKit modal
                  → Email (magic link)
                  → Google (social login)
                  → [Future: MetaMask, WalletConnect, etc.]
              → On success → wallet address linked to user record
              → Progress auto-merges
```

### Key Decisions

- **Reown AppKit** provides the login modal (email, Google, wallets) - no custom modal needed
- **Device_id system stays** as the anonymous identity layer
- **Wallet address** is the authenticated identity, linked to user record on sign-in
- **Supabase PostgreSQL** remains the data store (no web3 storage changes)
- **No forced login** - sign-in button in UI, app fully usable without it

### Providers Stack (layout.tsx)

```
<WagmiProvider config={wagmiConfig}>
  <QueryClientProvider client={queryClient}>
    <AppKitProvider>
      {children}
    </AppKitProvider>
  </QueryClientProvider>
</WagmiProvider>
```

## Data Flow

### Anonymous → Authenticated Transition

**Case 1 - Fresh sign-in (wallet not linked to any user):**
```
Current: { id: "uuid-A", device_id: "dev-123", wallet_address: null }
Action:  UPDATE users SET wallet_address = "0xABC..." WHERE id = "uuid-A"
Result:  Same user, now with wallet linked.
```

**Case 2 - Wallet already linked (cross-device merge):**
```
Existing: { id: "uuid-B", device_id: "dev-456", wallet_address: "0xABC..." }
Current:  { id: "uuid-A", device_id: "dev-123", wallet_address: null }

Merge steps:
1. Copy progress from uuid-A → uuid-B (keep highest stageIndex per word)
2. Copy memory hooks from uuid-A → uuid-B (keep both, prefer newer timestamps)
3. Union category filters
4. Delete uuid-A
5. Update uuid-B.device_id = "dev-123"
6. Client switches to uuid-B as active userId
```

### Multi-Device Sync

After linking, any device signing in with the same email → same wallet address → same user → same progress.

### New API Endpoint

`POST /api/auth/link-wallet`
- Input: `{ deviceId: string, walletAddress: string }`
- Logic: Links wallet to current device user, merges if conflict
- Output: Same shape as `/api/sync` GET response

## UI Changes

### New Components
- `lib/wagmi-config.ts` - Wagmi + Reown config (project ID, chains, transports)
- `hooks/useAuth.ts` - Wraps wagmi's useAccount/useDisconnect, exposes `{ isConnected, address, signIn, signOut }`
- `components/AuthButton.tsx` - "Sign in" button / connected status indicator

### Modified Files
- `app/layout.tsx` - Add WagmiProvider, QueryClientProvider, AppKitProvider
- `hooks/useAppState.ts` - Effect to call link-wallet API when wallet connects
- `components/SettingsPanel.tsx` - Show auth status, sign-out option
- `lib/db/queries/users.ts` - Add merge logic for `linkWalletToUser`
- `lib/db/schema.ts` - No changes needed (email + walletAddress columns already exist)

## Testing Strategy

### Setup: Vitest

Add vitest + @testing-library/react for unit/integration tests.

### Unit Tests
1. **Merge logic** (`lib/db/queries/users.ts`) - Fresh link, conflict merge, highest stage wins
2. **useAuth hook** - State transitions: disconnected → connected, sign-out
3. **useAppState integration** - Wallet connection triggers link-wallet API

### Integration Tests (API)
4. **POST /api/auth/link-wallet** - Fresh link, merge, invalid input, idempotency
5. **GET/POST /api/sync** - Works for anonymous AND authenticated users (no regression)
6. **Progress merge correctness** - Highest stage wins, hooks merge, filters union

### E2E Smoke Tests (Optional, Playwright)
7. Anonymous user flow (no regression)
8. Sign-in button opens Reown modal
9. After sign-in, progress preserved
10. Sign out returns to anonymous

## Implementation Plan

### Phase 1: Setup
- Create git worktree for isolation
- Install dependencies: wagmi, @reown/appkit, @tanstack/react-query, viem
- Set up Reown project (get project ID from cloud.reown.com)
- Configure wagmi + AppKit

### Phase 2: Auth Infrastructure
- Create wagmi config (`lib/wagmi-config.ts`)
- Wrap app in providers (`app/layout.tsx`)
- Create useAuth hook (`hooks/useAuth.ts`)
- Create AuthButton component (`components/AuthButton.tsx`)

### Phase 3: Backend - Link Wallet API
- Add merge logic to `lib/db/queries/users.ts`
- Create `POST /api/auth/link-wallet` endpoint
- Write tests for merge logic and API

### Phase 4: Integration
- Wire useAppState to detect wallet connection and call link-wallet
- Update SettingsPanel with auth status
- Test anonymous → authenticated flow

### Phase 5: Testing & Review
- Set up Vitest
- Write unit + integration tests
- Code review rounds with fixes
- Verify no regressions
