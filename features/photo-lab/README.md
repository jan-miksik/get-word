# Photo Lab Feature

Photo Lab analyzes a local photo, overlays vocabulary labels, generates audio,
and keeps a bounded device-local history.

## Read First

- Route shell and local font: `app/photo-lab/page.tsx`
- UI composition: `features/photo-lab/components/PhotoLabPage.tsx`
- Client workflow and blob URL lifecycle: `features/photo-lab/components/usePhotoLabStudio.ts`
- IndexedDB history: `features/photo-lab/client/photoStore.ts`
- Analysis/audio services: `features/photo-lab/server/analyze.ts`, `audio.ts`
- Thin HTTP routes: `app/api/photo-lab/*/route.ts`

## Stable Client Contracts

- Enable flag: `get-word-photo-lab-enabled`
- Language pair: `get-word-photo-lab-langs`
- Study mode: `get-word-photo-lab-mode`
- IndexedDB database: `getword-photo-lab`

Photo Lab may use shared language and low-level storage foundations, but must not
import learning onboarding UI or lists hooks. Its preference and session storage
remain owned by this feature.
