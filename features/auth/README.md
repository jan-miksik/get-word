# Auth Feature

Auth is split between a Supabase-backed login flow, a server session handoff that
mints the app's own trusted session, and device-based anonymous identity used by
sync before a full sign-in exists.

Supabase Auth is only a **one-shot identity verifier**. Once the server verifies
the Supabase user, the app mints and trusts its own signed `get_word_session`
cookie — Supabase's own session is not the source of truth afterwards.

## Client Login Flow

- `app/login/page.tsx`
  - The sign-in UI. Two methods:
    - **Google OAuth**: `supabase.auth.signInWithOAuth({ provider: 'google' })`
      redirects to `/api/auth/callback`.
    - **Email one-time code**: `signInWithOtp` → `verifyOtp`, then POSTs to
      `/api/auth/sync-user` to mint the app session.
  - Before starting OAuth it drops a short-lived `gw_device_claim` cookie so the
    top-level callback (which can't read `localStorage`) can claim the device's
    existing progress.
- `features/auth/client/useAuth.ts`
  - App-wide React hook for auth state. Reads identity from `/api/auth/me`.
  - Exposes `signIn`, `signOut`, `openAccountMenu`, `email`, `authProvider`, and
    loading status. `address` is reserved for future wallet linking (always
    `undefined` for now).
- `features/auth/supabase/browser.ts` / `server.ts`
  - Browser and server (cookie-aware) Supabase clients.
- `features/auth/supabase/env.ts`
  - Reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
    exposes `isSupabaseConfigured()` to gate the login UI.

## Server Session Handoff

- `app/api/auth/callback/route.ts`
  - Supabase OAuth / magic-link callback. Exchanges the PKCE `code`, verifies the
    user with `getUser()` (never trusts `getSession()`), resolves/attaches the app
    user, mints `get_word_session`, and redirects.
- `app/api/auth/sync-user/route.ts`
  - Client-initiated mint after an email-OTP verify (or a re-sync). Verifies the
    already-present Supabase session with `getUser()`, then mints the app session.
- `features/auth/server/resolve-supabase-user.ts`
  - Resolves the app `users` row for a verified Supabase identity and attaches
    `supabase_auth_id`. Priority: existing `supabase_auth_id` → email → device
    claim → create. Never deletes or merges rows, so owned word lists can't be
    orphaned.
- `app/api/auth/me/route.ts`
  - Lightweight identity check that reads only the app session cookie (no Supabase
    network call). Returns `{ authenticated: false }` for device-only visitors.
- `app/api/auth/logout/route.ts`
  - Clears the signed session cookie and detaches the current device from the
    session user when supplied.
- `features/shared/routes/session.ts`
  - Shared helpers that set the `get_word_session` cookie on a response
    (`setSessionCookieOnResponse`, `withSessionCookie`).

### Wallet linking (disabled)

- `app/api/auth/link-wallet/route.ts` is intentionally disabled and returns `410`.
  The previous version trusted client-supplied email/device/wallet input to mint a
  session, which is an auth bypass now that Supabase is the verifier. Wallet
  support will return as an additive feature gated behind a signed
  wallet-ownership challenge for the future stake/payment layer.

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
  sync responses.

## Placement

- Put new frontend auth code in `features/auth/client`; Supabase client/config in
  `features/auth/supabase`.
- Put server-side identity resolution in `features/auth/server`.
- Put synced auth identity state in `features/auth/state`.
- Keep low-level primitives in `lib`: session signing, device ID, session ID,
  request auth helpers, and DB access.
- Keep `app/api/auth/*` as thin route shells. If route behavior grows, extract it
  into `features/auth/server`.
- Put helpers shared by several features in `features/shared`, not under auth.

## Tests

- `features/auth/server/__tests__/resolve-supabase-user.test.ts`
- `app/api/auth/__tests__/link-wallet.test.ts` (asserts the route is disabled)
- `lib/__tests__/sync.test.ts`
- `__tests__/proxy.test.ts`
