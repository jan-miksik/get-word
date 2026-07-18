# Audio Feature

## Purpose

Owns generated/reused pronunciation audio across the list workflow and learning surfaces.

## Read First

- `features/lists/audio-step/AudioStep.tsx`
- `features/audio/server/generate-batch.ts`
- `app/api/audio/generate/batch/route.ts`
- `lib/audio.ts`
- `lib/audio-availability.ts`
- `docs/architecture/audio-arweave-service.md`

## Rules

- Keep route files as request/response shells.
- Put generation, quota, dedupe, storage, and persistence policy in `features/audio/server/*`.
- Keep operator-only audio tooling under `scripts/*`; share tooling helpers in
  `scripts/lib` and runtime repair behavior in `features/audio/server/repair`.
