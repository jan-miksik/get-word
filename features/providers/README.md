# Providers Feature

## Purpose

Owns external provider connections such as OpenRouter and key-management flows used by list translation/audio tooling.

## Read First

- `features/lists/components/ApiKeySettings.tsx`
- `app/api/providers/openrouter/status/route.ts`
- `app/api/providers/openrouter/callback/route.ts`
- `lib/providers/*`

## Notes

- Provider UI should call feature API modules rather than inline `fetch` wrappers.
