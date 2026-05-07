# Audio Feature

## Purpose

Owns generated/reused pronunciation audio across the list workflow and learning surfaces.

## Read First

- `app/lists/AudioStep.tsx`
- `features/audio/server/generate-batch.ts`
- `app/api/audio/generate/batch/route.ts`
- `lib/audio.ts`
- `lib/audio-availability.ts`
- `docs/architecture/audio-arweave-service.md`

## Rules

- Keep route files as request/response shells.
- Put generation, quota, dedupe, storage, and persistence policy in `features/audio/server/*`.
