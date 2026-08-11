# ADR: Offline sync ownership and conflict policy

Status: accepted, incremental rollout

## Decision

The server is the authority for non-commutative conflict domains. A client
wall-clock timestamp may be retained as compatibility metadata, but must not be
the sole input that chooses a winner. New replace-style operations carry the
opaque server revision from which they were created. Matching revisions apply
and advance the revision; stale revisions use the domain merge rule or return
an explicit conflict. `clientOpId` makes a replay idempotent.

The sync runtime is an offline-first subsystem rather than React state. Its
durable outbox never silently discards an operation. Operations are pending,
retrying, or blocked; a completed operation is removed only after an applied or
duplicate acknowledgement has first been projected into the durable domain
stores.

## Conflict domains

| Domain | Authority and merge rule |
| --- | --- |
| Review event | Immutable; idempotent by event ID. |
| Progress | Derived from review events. A legacy snapshot cannot overwrite state derived from newer accepted events. |
| Game score | Monotonic maximum. |
| Memory hook | Per-content-key server revision and tombstone. |
| Settings language | Independent server revision; stale replace returns conflict. |
| Learning language pair | Independent server revision; from/to/onboarding apply atomically. |
| Category filters | Base revision plus explicit replace/conflict policy. |

## Error and recovery policy

- Network errors, timeouts, 429, and temporary 5xx responses are retryable with
  bounded exponential backoff.
- An expired session blocks the operation as `auth_required`; successful app
  authentication resumes only this class of blocked operations.
- A revision conflict remains blocked until refresh/rebase or an explicit user
  decision.
- Invalid payloads, revoked permission, and missing targets are permanent and
  remain diagnosable until discard or edit/retry.
- Unknown failures receive a limited number of retries and then become blocked.
- A retry uses a stable `batchId` and exactly the original `clientOpId` cohort;
  equal attempt counts are not treated as request identity.
- Revision-aware replace operations are sent separately from unrelated review,
  progress, and hook writes. An aggregate 409 returns unrelated operations to a
  fresh pending cohort rather than blocking them as conflicts.

## Timestamp inventory

`client_created_at`, `client_updated_at`, `settings_language_selected_at`, and
`language_pair_selected_at` originate on the client. They preserve old-client
compatibility and help diagnostics, but are not trusted conflict clocks for the
new protocol. Database `created_at`/`updated_at` fields and sync cursors are
server generated. Existing language timestamp arbitration stays in place only
during the additive revision rollout.

## Compatibility rollout

The existing `/api/sync` path and response fields stay stable. Structured
`op_results`, settings-language revisions, and language-pair revisions are
additive; legacy ack arrays remain until the oldest supported client no longer
needs them. IndexedDB records written before the lifecycle fields are read as
`pending`.

## Current rollout status

- Settings language and the learning language pair use atomic, server-side
  revision predicates. A stale base revision returns HTTP 409 and per-operation
  `conflict` results even when the client clock is badly skewed.
- Applied `clientOpId` values are stored per user. A complete replay is
  acknowledged as `duplicate` without reapplying effects. A mixed replay in the
  legacy aggregate wire shape is explicitly blocked for refresh/rebase rather
  than applied ambiguously.
- Mutation ACKs contain only a delta. The drainer therefore checkpoints the
  acknowledged commands into IndexedDB before deleting their outbox records and
  publishes the reconciled snapshot only after that ordering succeeds. A crash
  or local write failure leaves the stable cohort available for duplicate-safe
  replay.
- Review events are immutable and deduplicated by `(user, clientEventId)`; game
  score remains monotonic `max`.
- Memory-hook deletion uses server-stamped tombstones and the server sync cursor.
  A finer per-key opaque revision can be added when a second concurrent editing
  implementation exists.
- Category visibility is currently list-scoped local UI state; its legacy flat
  server field is not written by the active client. Before cross-device writes
  are re-enabled it must gain a list-scoped base revision and replace policy.
- Progress review events are the primary immutable input. Legacy/manual progress
  snapshots retain their timestamp guard for old clients and are explicitly a
  compatibility path, not the model for new conflict domains.

## IndexedDB support window

Database version 4 separates synced content from the legacy full snapshot.
Upgrade handlers are cumulative, so versions 1, 2, and 3 can open version 4
directly. The legacy snapshot is copied before any future removal and remains a
read fallback; migration failure never deletes it. Removing that reader requires
an explicit support-window decision and direct-upgrade tests from the newly
oldest supported version.
