# Word Chat Feature

## Purpose

Owns the conversational add-words workflow: learner preferences, chat and
proposal generation, manual or photo-supplied entries, translation, audio,
review, and the idempotent commit into a personal list.

## Read First

- `types.ts` — shared chat, proposal, review, and preference shapes.
- `components/WordChatFlow.tsx` — step-level UI composition.
- `hooks/useWordChat.ts` — client workflow orchestration.
- `hooks/review-items.ts` — pure translation-to-review mapping and review-row transitions.
- `hooks/useReviewItemState.ts`, `hooks/useAudioJobQueue.ts` — async Review state invariants.
- `client/api.ts` — browser transport for the word-chat routes.
- `client/audio-generation.ts` — retry/caching policy for generated clips.
- `client/storage.ts` — durable interrupted-session draft.
- `server/prompt.ts` — prompt construction and conversation policy.
- `server/chat.ts`, `server/propose.ts`, `server/translate.ts` — model-backed services.
- `server/commit.ts` — idempotent persistence into lists/categories/items.
- `public.client.ts` — the only client entrypoint for other features.

## Flow

```text
AddWordsScreen
  -> WordChatFlow
  -> useWordChat
  -> client/api
  -> app/api/word-chat/*/route.ts
  -> features/word-chat/server/*
```

The UI moves through `chat -> select -> review -> done`. Manual entry begins at
`select`; photo-derived pairs can join the same selection/review pipeline.

## Ownership Boundaries

- UI and client workflow state stay in `components`, `hooks`, and `client`.
- Route files parse/authenticate and call `server` services; business behavior
  does not belong in a route shell.
- New cross-feature consumers import from `public.client.ts`. Existing direct
  imports covered by the boundary allowlist are transitional debt; do not copy
  them or expose the central hook/storage as a convenience shortcut.
- Canonical word-chat shapes belong in `types.ts`; list-owned shapes should be
  consumed through the lists contract rather than copied here.

## Invariants

- `languageFrom` is the known/source side and `languageTo` is the target side.
- A commit creation key is stable across rerenders and retries. Changing it can
  create duplicate categories or items.
- Draft restore runs once per mounted session and must not overwrite newer
  learner-level preferences with stale draft values.
- Review may open while audio is generated in the background. Commit waits for
  tracked audio jobs only up to its bounded timeout and may save without audio.
- Translation results are matched back to submitted items by normalized text,
  not response ordering.
- Provider diagnostics and editor model overrides are debugging surfaces; they
  must not change the learner-facing fallback and retry semantics.

## Refactoring Guidance

`hooks/useWordChat.ts` is currently the main hotspot. Prefer safe extraction of
one remaining lifecycle at a time—draft restore, preferences,
proposal/selection, or commit/retry—while keeping the hook's external contract
stable. Review transformations, synchronous Review state, and the audio job
queue already have focused modules; extend those instead of moving their logic
back into the controller.

Keep tests grouped by lifecycle instead of extending a single end-to-end hook
test indefinitely.

## Verification

- Client hook/components: `pnpm run test:agent -- features/word-chat`
- Route shells: `pnpm run test:agent -- app/api/word-chat`
- Boundary changes: `pnpm run check:boundaries`
