# Photo Lab Feature

Photo Lab analyzes a local photo, overlays vocabulary labels, generates audio,
and keeps a bounded device-local history.

## Read First

- Route shell: `app/photo-lab/page.tsx`; shared display font: `features/photo-lab/font.ts`
- UI composition: `features/photo-lab/components/PhotoLabPage.tsx`
- Client workflow and blob URL lifecycle: `features/photo-lab/components/usePhotoLabStudio.ts`
- IndexedDB history: `features/photo-lab/client/photoStore.ts`
- Analysis/audio services: `features/photo-lab/server/analyze.ts`, `audio.ts`
- Thin HTTP routes: `app/api/photo-lab/*/route.ts`

## Entry points

The study view (`app/HomeClient.tsx`) opens the lab **in place**, the way it
opens the word chat: `PhotoLabPage` replaces the study tree, gets its own
history entry so the phone's back gesture closes it, and `onClose` drops back
onto the deck that kept running behind it. The page is loaded lazily, so none of
this feature ships in the study bundle until it is opened.

`/photo-lab` stays the standalone entry for bookmarks, shared links, the
settings link, and a modifier-click on the top-bar shortcut. There `onClose` is
absent and back is a link home — or a history pop when `?from=study` says a live
deck was left behind.

## Allowances

`features/photo-lab/server/rate-limit.ts` picks one of three paths per account:
editors get a daily bucket, free accounts a weekly one, and school members their
plan's monthly quota in `school_feature_usage`. A free/editor account is also
subject to a shared daily global bucket — an abuse ceiling on the server key,
not a per-user allowance.

`users.photo_lab_limit_override` (operator-set, see `scripts/user-limits.ts`)
replaces the limit on whichever path applies, school quota included. `NULL`
means "use the normal limit"; `0` turns photo analysis off for that account.

The client mirrors the remaining count under the photo history and disables the
capture button at zero. `/api/photo-lab/analyze` re-checks before reading the
upload body, and `requestPhotoAnalysis` aborts after
`PHOTO_LAB_ANALYZE_TIMEOUT_MS` so a stalled request can never leave the UI
spinning.

## Stable Client Contracts

- Enable flag: `get-word-photo-lab-enabled`
- Language pair: `get-word-photo-lab-langs`
- Study mode: `get-word-photo-lab-mode`
- IndexedDB database: `getword-photo-lab`

Photo Lab may use shared language and low-level storage foundations, but must not
import learning onboarding UI or lists hooks. Its preference and session storage
remain owned by this feature.
