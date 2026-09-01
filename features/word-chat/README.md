# Word Chat Feature

## Purpose

Owns the conversational add-words workflow: learner preferences, chat and
proposal generation, manual or photo-supplied entries, translation, audio,
review, and the idempotent commit into a personal list.

## Read First

- `types.ts` — shared chat, proposal, review, and preference shapes.
- `components/WordChatFlow.tsx` — step-level UI composition.
- `hooks/useWordChat.ts` — client workflow orchestration and recovery targets.
- `hooks/useChatTurn.ts` — cancellable chat requests, transcript updates, and stale-response guards.
- `client/request-deadline.ts` — deadlines covering both HTTP headers and response bodies.
- `hooks/review-items.ts` — pure translation-to-review mapping and review-row transitions.
- `hooks/useReviewItemState.ts`, `hooks/useAudioJobQueue.ts` — async Review state invariants.
- `client/api.ts` — browser transport for the word-chat routes.
- `client/audio-generation.ts` — retry/caching policy for generated clips.
- `client/storage.ts` — durable interrupted-session draft.
- `server/prompt.ts` — prompt construction and conversation policy.
- `server/chat-response.ts` — response normalization and local recovery without model-generated actions.
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

## Chat recovery

- Chat uses at most two provider attempts, each bounded to 15 seconds. The first
  streams upstream; a retryable failure uses a buffered completion inside the
  same turn allowance and spend reservation. Proposal/translation model routing,
  privacy settings, and spend limits are unchanged.
- Buffered and streaming HTTP run the same executor, including spend accounting
  and the final local fallback. The protocol tests exercise the real provider
  parser, executor, route serializer, and browser parser together.
- Model output accepts camelCase or snake_case fields and literal string booleans.
  A missing ready flag can use the completed-follow-up policy only when the model
  explicitly returned a null language action. A missing final reply gets a local
  handoff. Conflicting aliases or missing/invalid language actions never authorize
  navigation.
- If both responses still fail format validation, the server returns a local
  `recovery_required` reply instead of a generic sending error. It never changes
  languages or starts a paid proposal. The UI displays explicit continuation even
  without an error banner, and preserves it across reload/settings pair changes.
  Authentication, spend-limit, transport, and infrastructure errors retain their
  normal failure policy; local recovery is limited to model format failures.
- Only complete, validated JSON can navigate or propose. Missing/irrelevant
  suggestions and a missing final content mode are normalized (`mixed` is the
  conservative default). After the learner answers the one follow-up, another
  interview question becomes a localized handoff to the proposal. Valid language
  changes take priority; malformed language actions retry instead of proposing
  for the wrong pair. Truncated text never appears as a successful response.
- The browser allows 40 seconds for the single HTTP request, including body
  consumption. A broken stream, dropped connection, or bare gateway failure is
  retryable, but never starts another request automatically: after an ambiguous
  transport failure the original turn may already have spent or completed.
  The transcript stays intact and the learner can explicitly choose Retry.
  Cancellation is terminal for that request as well.
- Stream error events retain the ordinary HTTP error code, retryability, and
  status. Provider key rejection and exhausted quotas cannot become retry loops.
- The first recoverable chat error offers Retry, an explicit direct proposal
  action, and the host's ready-made list action. The direct proposal uses the
  current language pair and the complete transcript, without another chat call.
  The outage screen also offers manual entry, including when no starter list
  callback is available. Manual entry still needs translation connectivity.
- Drafts persist unfinished chat/proposal operations as well as their transcript.
  Reload restores the appropriate Retry action without automatically spending
  again; legacy drafts ending with an unanswered user message are recoverable.
  Double submits are synchronously guarded. Reset, manual entry, and unmount
  cancel pending chat/proposal work; late responses cannot overwrite newer work.
- Context loading has a 10-second deadline and degrades to the existing local
  preferences/generic opener. Proposal HTTP requests have a 120-second client
  deadline and remain manually retryable. These recovery paths do not make the
  app work fully offline or bypass the provider, authentication, or budget limits.

Verification covers the reported common-words → shopping conversation, malformed
metadata, truncated JSON, stalled bodies, single-request transport recovery, terminal errors,
quota classification, cancellation, double submits, and reload during chat/proposal.
The server logs metadata repair and provider attempt failures; the browser logs
transport error codes/statuses. Those recovery events contain no transcript.

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
