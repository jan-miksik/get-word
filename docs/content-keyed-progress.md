# Content-keyed progress — spec & rollout

Status: proposed (2026-06-26). Owner: Jan.

## Goal

Make spaced-repetition progress a property of **the word pair the user is learning**, not of a specific list item. Studying "hi → ahoj" in any `en→cs` list advances the same progress. Recreating a list (or a default list) reattaches progress automatically by content.

### Agreed behavior

- Progress identity = **normalized content**, scoped to the language pair.
- **Editing content resets progress** by default. Cosmetic edits (case, trailing dots, whitespace) do **not** reset — normalization absorbs them.
- A later **"keep progress" toggle** lets an edit carry progress to the new text instead of resetting.
- On any conflict, **latest review wins** (same rule already used for cross-device LWW).
- Single user / mostly one shared list today, so duplicate-content collisions are effectively absent — the design stays simple.

## 1. The key

```
content_key = normalize(text_known) ⋄ normalize(text_target) ⋄ lang_from ⋄ lang_to
```

(`⋄` = a separator that cannot appear in the fields, e.g. ``.)

`normalize(s)`:
1. Unicode NFC normalize (so Vietnamese diacritics compare stably).
2. Trim, then collapse internal whitespace runs to a single space.
3. Strip trailing `.` characters (and any whitespace they leave).
4. `toLowerCase()`.

Deliberately **kept** (they change meaning, so they reset): `?`, `!`, internal punctuation, commas, diacritics.

Decisions baked in:
- **Both sides** are in the key → editing the *translation* also resets (the answer changed).
- **Language pair** is in the key → `hi` (en→cs) never collides with `hi` (en→de).
- Items with an empty `text_target` (placeholder/awaiting translation) get **no** progress record until translated.

Implement once as a shared pure helper (e.g. `lib/progress-key.ts`) and use it on **both** server and client so the keys always agree. Model it on the existing `normalize` logic in `lib/formatting-polish.ts`.

## 2. Schema (migration 0035)

`user_progress`:
- add `content_key text` (nullable during rollout).
- add partial unique `(user_id, content_key) WHERE content_key IS NOT NULL`.
- keep `word_list_item_id` as **informational** ("last item reviewed"), no longer the identity.
- keep legacy `word_id` untouched.

Identity precedence after rollout: `content_key` (primary) → `word_id` (legacy only).

## 3. Backfill

For each existing `user_progress` row that has a `word_list_item_id`:
1. Compute `content_key` from the item's text + its list's `language_from/to`.
2. Collapse rows that land on the same `(user_id, content_key)`:
   - **keep the row with the latest review** (`greatest(last_known_at, last_unknown_at, updated_at)`) — *latest review wins*.
   - drop/archive the losers.
3. Rows with only a legacy `word_id` (no item) keep working on the legacy path.

At current scale this is a handful of rows; collisions are unlikely but the rule is defined.

## 4. Write path (server)

- `applyReviewEventToProgress` and the `batchUpsertProgressByItemId` path compute `content_key` from the reviewed item and **upsert on `(user_id, content_key)`** instead of `(user_id, word_list_item_id)`.
- Stamp `word_list_item_id` with whatever item was just reviewed (informational).
- LWW unchanged — `progressLwwSetWhere()` already encodes "latest review wins".

## 5. Read / hydrate path

- `getHydratedWordListData` and the client: compute each displayed item's `content_key` and match progress by `(user_id, content_key)`.
- **Sync wire format**: include `content_key` on progress rows so the client matches without re-deriving list languages. Client computes the item's key from word text + pair and looks it up.

## 6. Edit behavior (the reset)

- **Reset is emergent, not coded.** Editing an item changes its text → new `content_key` → the read path finds no record for the new key → the word shows as stage 0. The old record is left **orphaned** (cheap undo: revert the edit and progress returns). Optional GC later.
- **Cosmetic edits** normalize to the same key → progress preserved automatically.
- **"Keep progress" toggle (follow-up):** the edit endpoint has both old and new text, so it re-keys the editor's record:
  `UPDATE user_progress SET content_key = <new> WHERE user_id = … AND content_key = <old>`.
  Affects only the editor's own progress. With multiple subscribers this only re-keys the editor; others reset on next study — acceptable at current scale, revisit if the user base grows.

## 7. Default-list reconnect

Two halves:
- **Progress** — *free* with this change. A recreated list with the same words reattaches every stage by `content_key`; no list-identity work. (This also would have prevented the June 2026 list-deletion incident.)
- **Subscription / membership** — separate, small **follow-up**. Pick one when ready:
  - soft-delete lists (`deleted_at`) so subscriptions survive delete→recreate (also a general safety net);
  - treat the **recommended list for a pair** as a stable identity and auto-attach;
  - an admin "replace list" action that transplants subscription rows old→new.

Recommendation: ship content-keyed progress first (covers the painful half), add the membership reconnect afterward.

## 7a. Implementation note — server-side projection (read path)

The client already looks every word's progress up by item id (`progress[word.id]`)
and never reconstructs keys. So rather than putting `content_key` on the wire and
refactoring every client lookup, the **server projects** content-keyed rows back
onto item ids: `getProjectedProgress` recomputes each hydrated item's *current*
content key and emits `progress[itemId] = row` for the matching content-keyed row
(`lib/db/queries/progress.ts`). The wire stays keyed by item id; the client is
unchanged. This yields identical behavior — cross-list sharing (siblings compute
the same key), and edit-reset (an edited item computes a new key → no row → stage
0) — with no stale item-id fallback (we never read progress by item id; we read by
content key and project onto *current* item ids). The delta path projects the same
way over `getUserItemIdentities`. Trade-off: hydrate recomputes a hash per item;
fine at current scale, optimizable later by persisting `content_key` on items.

## 8. Edge cases / trade-offs

- **Homographs** (same known+target, different sense) collapse to one record — acceptable.
- **Sentences** are exact-match-only and brittle; most won't transfer between independently authored lists — acceptable (and consistent with "edit resets").
- **Orphan accumulation** from edits/resets is negligible; optional GC job later.
- **Multi-user "keep progress"** is editor-scoped (see §6).

## 9. Rollout order

1. Add `content_key` column + partial index, nullable, no unique yet. Ship `lib/progress-key.ts`.
2. Backfill `content_key`; resolve collisions (latest review wins).
3. Add the partial unique `(user_id, content_key)`.
4. Switch the **write** path to upsert by `content_key`.
5. Switch the **read/hydrate + client match** to `content_key`; add `content_key` to the sync wire format.
6. Verify edit-reset + cosmetic-edit-preserve behavior end to end.
7. Follow-ups: "keep progress" toggle; default-list subscription reconnect.

## 10. Test plan

- `progress-key` unit tests: case, trailing dots, whitespace collapse, NFC diacritics, both sides, pair scoping.
- Study in list A → same content shows the stage in list B.
- Edit known → resets; edit target → resets; cosmetic edit (case/dot) → preserved.
- Delete + recreate a list with the same words → progress reattaches.
- Backfill: two item-keyed rows for the same content collapse to the latest-review one.
