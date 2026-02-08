# Code Review: WordLink

**Review date:** February 2025  
**Scope:** Full codebase (Next.js 15, React 19, Drizzle, Supabase)

---

## Executive Summary

The project is well-structured with clear data flow, solid TypeScript usage, and thoughtful patterns (hydration timeout, debounced sync, virtualized lists). The main areas to address are **security** (unprotected words API, sync identity model), **one confirmed bug** (memory-hooks batch upsert), **duplication** (press-handler logic), and **tooling** (missing ESLint config, no tests).

---

## 1. Security

### 1.1 Words API has no authentication (High)

**File:** `app/api/words/route.ts`

- **Finding:** GET, POST, PUT, and DELETE are callable by anyone. In a public deployment, anyone can read, create, update, or delete vocabulary.
- **Recommendation:** If the app is public, protect the write operations (POST, PUT, DELETE) with authentication or at least a shared secret / API key in env. Optionally restrict GET or rate-limit it.

### 1.2 Sync API: identity from client only (Medium)

**File:** `app/api/sync/route.ts`

- **Finding:** User identity is determined only by `deviceId` and optional `userId` from the request body/query. There is no server-side verification (e.g. signed token, session).
- **Impact:** Acceptable for a device-only, “anonymous” user model, but:
  - If `userId` is ever leaked (e.g. in logs, client), another client could send that `userId` and bind their device to that user (see `resolveUser` updating `deviceId` when `userId` is provided and differs).
- **Recommendation:** Document that `userId` is sensitive. Avoid logging it in production. If you later add real auth, tie sync to a verified session instead of raw client-supplied ids.

### 1.3 SQL usage (Low)

**File:** `lib/db/queries/words.ts` — `getWordsByCategory(category: string)`

- **Finding:** Uses `sql\`${words.category} @> ARRAY[${category}]::text[]\``. In Drizzle, values interpolated in `sql` are typically parameterized; worth confirming that `category` is not concatenated as raw SQL.
- **Recommendation:** If in doubt, use an explicit parameter or a Drizzle helper so it’s clear the argument is never raw SQL.

---

## 2. Bugs

### 2.1 Batch upsert of memory hooks does not update text (High)

**File:** `lib/db/queries/memory-hooks.ts` — `batchUpsertMemoryHooks`

- **Finding:** In `onConflictDoUpdate`, `set` uses `hookText: userMemoryHooks.hookText`. That refers to the *table column* (existing row), not the incoming value, so on conflict the hook text is never updated.
- **Fix:** Set the updated value from the insert, e.g. `hookText: sql\`excluded.hook_text\`` (or the equivalent in your Drizzle version), so conflict updates use the new `hookText`.

**Current (incorrect):**

```ts
set: {
  hookText: userMemoryHooks.hookText,  // keeps existing value
  updatedAt: new Date(),
},
```

**Suggested:**

```ts
set: {
  hookText: sql`excluded.hook_text`,
  updatedAt: new Date(),
},
```

(And add `import { sql } from "drizzle-orm";` if not already present.)

---

## 3. Code Quality & Maintainability

### 3.1 Duplicate press-handler logic (Medium)

**Files:** `app/page.tsx` (lines ~88–229), `app/edit/page.tsx` (lines ~81–187)

- **Finding:** Large, nearly identical blocks for touch/mouse “cover” press handling (thresholds, timeouts, scroll detection, cleanup). Edit page uses a simpler attachment (no MutationObserver).
- **Recommendation:** Extract a single hook, e.g. `useCoverPressHandlers(containerRef, options)`, and reuse it on both pages. Optionally support “observe dynamic children” (MutationObserver) via an option so the main page keeps current behavior and the edit page stays simple.

### 3.2 Multiple sync effects in useAppState (Low)

**File:** `hooks/useAppState.ts`

- **Finding:** Separate `useEffect` for syncing progress, role, memory_hooks, category_filters, show_english, show_category_badges. Each has the same guards (`isHydrated`, `isUpdatingFromServerRef`) and calls `debouncedSync` with different payloads.
- **Recommendation:** Consider a single “sync state” effect that builds one payload from the relevant state and calls `debouncedSync` once, or a small helper that registers which slices are dirty and merges them. This would reduce duplication and make it easier to add new synced fields.

### 3.3 Magic numbers (Low)

- **Finding:** Hydration timeout (10s), sync debounce (1s), batch sizes (100), press delay (150ms), scroll threshold (5px) are hard-coded in different files.
- **Recommendation:** Centralize in a small `constants.ts` or config (e.g. `SYNC_DEBOUNCE_MS`, `HYDRATION_TIMEOUT_MS`, `BATCH_SIZE`). Improves consistency and makes tuning easier.

---

## 4. Tooling & Testing

### 4.1 ESLint configuration missing (Medium)

- **Finding:** `package.json` has `"lint": "eslint ."` but there is no `eslint.config.js`, `eslint.config.mjs`, or `.eslintrc*` in the repo. Lint either fails or runs with default config.
- **Recommendation:** Add an ESLint config (e.g. flat config for Next/TypeScript) and ensure `pnpm lint` runs the intended rules.

### 4.2 No test framework (Medium)

- **Finding:** CLAUDE.md states “No test framework configured.” There is a single `scripts/progress-stats.test.ts` that appears to be a manual or one-off script.
- **Recommendation:** Introduce a test runner (e.g. Vitest) and add unit tests for critical logic first: `lib/words.ts` (e.g. `isDue`, `matchesCategoryFilter`, `normalizeWords`), `lib/progress-stats.ts`, and sync/debounce behavior if possible. This will make refactors and the fix for the memory-hooks batch upsert safer.

---

## 5. Performance

- **Positives:** Virtualized word list (`VirtualizedWordList`), memoized normalized words and filtered/grouped lists, `useCallback` for card renderer and handlers, batch progress upserts (100 per batch).
- **Consideration:** Sync POST sends the full progress object when any progress changes. For users with many words, payload size can grow; debounce already helps. If it becomes an issue, consider sending only changed or “dirty” progress entries.

---

## 6. Consistency & Documentation

### 6.1 Naming and docs

- **Finding:** `package.json` has `"name": "app-for-learning-language"` while docs refer to “WordLink.” Minor confusion for developers.
- **Recommendation:** Align name (e.g. `wordlink` or `app-for-learning-language`) and ensure README/CLAUDE mention the same product name.

### 6.2 Next.js config

- **Finding:** `next.config.js` sets `output: 'standalone'` with a comment “Required for OpenNext/Cloudflare,” whereas CLAUDE.md says deploys go to Vercel.
- **Recommendation:** If you only use Vercel, you can drop `output: 'standalone'` unless you need it for something else. If you use multiple runtimes, add a short comment in the config or README.

---

## 7. Retry and resilience

### 7.1 Sync API retry (Low)

- **File:** `app/api/sync/route.ts` — `withRetryOnTimeout`
- **Finding:** On Postgres statement timeout (code `57014`), the operation is retried once after 800ms. There is no cap or backoff for repeated timeouts.
- **Recommendation:** For robustness, consider a small max-retry count (e.g. 2) and optionally exponential backoff so a single slow DB spike doesn’t cause multiple immediate retries.

---

## 8. Summary Table

| Category        | Severity | Count |
|----------------|----------|-------|
| Security       | High     | 1     |
| Security       | Medium   | 1     |
| Security       | Low      | 1     |
| Bugs           | High     | 1     |
| Code quality   | Medium   | 1     |
| Code quality   | Low      | 2     |
| Tooling/Testing| Medium   | 2     |
| Consistency    | Low      | 2     |
| Resilience     | Low      | 1     |

**Recommended order of work**

1. Fix memory-hooks batch upsert bug (`lib/db/queries/memory-hooks.ts`).
2. Add authentication or protection for words API if the app is or will be public.
3. Add ESLint config and run `pnpm lint` in CI.
4. Extract cover press-handler into a shared hook and add tests for core lib (words, progress-stats).
5. Optionally: consolidate sync effects, centralize constants, document sync identity model and Next config.

---

*End of code review.*
