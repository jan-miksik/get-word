# Auth Feature

## Purpose

Owns device-based identity, wallet linking, session cookies, and auth-related route behavior.

## Read First

- `features/auth/state/userProfile.ts`
- `app/api/auth/link-wallet/route.ts`
- `lib/auth.ts`
- `features/shared/routes/session.ts`

## Notes

- Client-side synced user identity state now lives in `features/auth/state/userProfile.ts`.
- Thin routes should use shared session/timing helpers instead of route-local copies.
