# Auth Feature

Auth is split between a frontend Reown/AppKit flow, a server session handoff,
and device-based anonymous identity used by sync before a full sign-in exists.

## Client Reown/AppKit Flow

- `features/auth/components/AppKitProvider.tsx`
  - Creates the Reown AppKit instance and wraps Wagmi/React Query providers.
  - Installs AppKit auth feature guards, embedded auth warmup, label overrides,
    Magic rejection handling, and telemetry no-ops.
- `features/auth/client/useAuth.ts`
  - App-wide React hook for Reown account state.
  - Exposes `signIn`, `signOut`, `openAccountMenu`, wallet address, email,
    auth provider, and loading status.
- `features/auth/client/appkit-auth-features.ts`
  - Waits for AppKit readiness before opening Connect.
  - Keeps required email/social features present.
  - Handles stale embedded-auth storage only on explicit failure paths.
- `features/auth/client/appkit-label-overrides.ts`
  - Reown custom element label tweaks.
- `features/auth/client/magic-rpc.ts`
  - Magic embedded-wallet access-denial detection and event constants.
- `features/auth/client/wagmi-config.ts`
  - Wagmi adapter, Reown project ID, supported networks, and wallet connector setup.

## Server Session Handoff

- `app/login/page.tsx` starts Reown sign-in via `useAuth()`.
- After Reown connects, `lib/sync.ts` calls `/api/auth/link-wallet` with the
  Reown wallet address plus optional email/auth provider.
- `app/api/auth/link-wallet/route.ts` resolves the winning user by email,
  wallet, or device, merges device progress where needed, returns a sync
  payload, and sets the signed app session cookie.
- `app/api/auth/logout/route.ts` clears the signed session cookie and detaches
  the current device from the session user when supplied.
- `features/shared/routes/session.ts` contains the shared response helper that
  sets the session cookie.

## Device Identity

- `lib/device-id.ts` owns the client-only `get_word_device_id` localStorage key.
- `lib/auth.ts` resolves API users from a signed session first, then falls back
  to the device ID header/query param.
- `lib/session.ts` signs and verifies the `get_word_session` cookie.
- `lib/session-id.ts` provides a per-tab/session hint for sync.
- `proxy.ts` guards authenticated routes with the signed session cookie.

## Sync Relationship

- `lib/sync.ts` sends `deviceId`, `sessionId`, and a last-known user hint to
  `/api/sync`.
- `hooks/useAppState.ts` and `features/learning/app-state/useServerSync.ts`
  apply sync payloads into app state.
- `features/auth/state/userProfile.ts` stores synced user identity fields on the
  client and mirrors `user_role` into the non-httpOnly `get_word_user_role`
  cookie for client-side editor UI checks.
- `features/shared/sync/response.ts` defines the user/profile shape returned in
  sync and link-wallet responses.

## Placement

- Put new frontend auth/Reown/AppKit code in `features/auth/client`.
- Put auth-specific UI in `features/auth/components`.
- Put synced auth identity state in `features/auth/state`.
- Keep low-level primitives in `lib`: session signing, device ID, session ID,
  request auth helpers, and DB access.
- Keep `app/api/auth/*` as thin route shells. If route behavior grows, extract it
  into `features/auth/server`.
- Put helpers shared by several features in `features/shared`, not under auth.

## Tests

- `features/auth/client/__tests__/useAuth.test.ts`
- `features/auth/client/__tests__/appkit-auth-features.test.ts`
- `features/auth/client/__tests__/appkit-label-overrides.test.ts`
- `features/auth/client/__tests__/magic-rpc.test.ts`
- `app/api/auth/__tests__/link-wallet.test.ts`
- `lib/__tests__/sync.test.ts`
- `lib/db/queries/__tests__/link-wallet.test.ts`
- `__tests__/proxy.test.ts`
