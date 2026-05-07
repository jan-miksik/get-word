# Sync Feature

## Purpose

Owns the client/server contract for user state sync.

## Read First

- `features/sync/types.ts`
- `app/api/sync/route.ts`
- `features/shared/sync/response.ts`
- `lib/sync.ts`

## Rules

- Canonical request and response DTOs live in `features/sync/types.ts`.
- Route files may validate and apply mutations, but they should import contract types instead of declaring local DTOs.
- Client helpers in `lib/sync.ts` may re-export these types for compatibility with older imports.
