# AI-Optimized Refactor Plan for Get Word

## Status

- Completed on April 11, 2026 as the main structural refactor pass.
- The repo now uses feature-local ownership for learning, edit, lists, auth, providers, and shared route/sync helpers.
- `app/page.tsx` and `app/edit/page.tsx` are thin shells.
- Top-level hook and library entrypoints that remain are compatibility barrels for incremental cleanup, not primary ownership.

## Remaining Optional Cleanup

- Remove compatibility barrels once import churn is acceptable.
- Continue feature-localizing generic UI hooks only when they become active task hotspots.
- Keep `docs/architecture/feature-map.md` and feature READMEs current as boundaries evolve.

## Summary

Refactor the repo toward feature-oriented locality so an agent can solve a task by opening one small area
instead of traversing pages, hooks, routes, DB queries, and helpers spread across the codebase.

  Primary goals:

  - reduce oversized mixed-responsibility files
  - remove duplicate client/server helpers
  - co-locate UI, route, service, and query logic by feature
  - add lightweight agent-facing navigation docs

  Tracking doc policy:

  - if implementation is done in 1-2 runs, skip a separate progress-plan file
  - if implementation will span multiple runs, create docs/plans/ai-optimized-refactor.md and keep it updated
    as the source of truth

  ## Key Changes

  ### 1. Reorganize by feature

  Move active product code into feature folders:

  - features/learning
  - features/lists
  - features/auth
  - features/audio
  - features/providers
  - features/shared only for real cross-feature primitives

  Each feature should own:

  - components/
  - hooks/
  - server/ or services/
  - types.ts
  - utils.ts
  - short README.md

  Keep app/ thin:

  - pages become composition shells
  - API routes become request/response adapters over feature services

  ### 2. Split the main hotspots

  Refactor these first:

  - app/page.tsx
    Split page shell, learning-stream/minigame orchestration, local preference state, and presentational
    sections.
  - app/edit/page.tsx
    Split editor shell, editable-word mutation logic, save action client, and shared learning-page
    composition.
  - app/lists/page.tsx
    Move list types, wizard state, selectors, and API actions into features/lists.
  - app/api/sync/route.ts
    Extract auth/session resolution, payload normalization, sync mutation handlers, response assembly, and
    route utilities.
  - lib/db/queries/word-list-items.ts
    Split into list queries, category queries, item mutations, subscription flows, translation lookup, and
    mapping helpers.
  - lib/minigames.ts
    Split text similarity, anchor planning, stream composition, and config utilities.

  Default target:

  - components/hooks/routes: ~150-200 lines soft cap
  - larger files allowed only for tightly cohesive pure logic with strong tests

  ### 3. Remove duplicate helpers

  Create shared primitives for repeated patterns.

  Client-side:

  - one typed JSON API client for authenticated requests
  - shared localStorage preference helpers
  - shared provider/OpenRouter status/connect/test client flows
  - shared response-to-state adapters for lists flow

  Server-side:

  - shared route timing/error/session helpers
  - shared UUID and rekey helpers
  - shared sync-response assembly for learning/auth flows
  - shared list metadata hydration logic

  ### 4. Tighten type ownership

  Move canonical domain types out of page files.

  Required moves:

  - list types from app/lists/page.tsx into features/lists/types.ts
  - sync payload/response types into feature-owned shared types
  - minigame types into features/learning or a dedicated learning domain module
  - provider connection/status types into features/providers/types.ts

  Rules:

  - pages never own canonical domain types
  - routes import service-layer types
  - DB modules export narrow concern-based APIs
  - cross-feature imports go through explicit public entrypoints

  ### 5. Add agent-facing navigation docs

  Add lightweight docs to reduce future discovery cost.

  Always add:

  - docs/architecture/feature-map.md
  - one short README.md per major feature folder
  - module-boundary guidance in CLAUDE.md or equivalent

  Only add docs/plans/ai-optimized-refactor.md if the refactor is staged across multiple runs.

  Each feature README should state:

  - purpose
  - entrypoints
  - key types
  - client/server split
  - “read these files first” for common tasks

  ## Public Interfaces / Type Changes

  Behavior should stay stable; internal ownership changes heavily.

  Changes:

  - canonical list types move out of app/lists/page.tsx
  - list UI stops using per-file apiFetch helpers
  - sync route internals move behind services without changing route path
  - DB query exports become grouped by concern
  - minigame logic becomes smaller focused modules

  Defaults:

  - preserve current HTTP routes
  - preserve current response shapes unless a cleanup is required
  - if a shape changes, provide one adapter layer rather than spreading migration logic across components

  ## Test Plan

  Must cover:

  - learning page due/new/settling behavior
  - edit-page editor gating and save flow
  - deterministic minigame behavior for fixed seeds
  - lists wizard create/preview/confirm/translate/audio flows
  - subscribe/unsubscribe behavior
  - sync GET/POST progress/hooks/filters/item hydration/session refresh
  - legacy wordId to itemId rekey behavior
  - provider/OpenRouter status/connect/test/delete flows

  - route tests for thin handlers
  - component tests for list wizard steps
  - one smoke test per major feature entrypoint

  ## Assumptions and Defaults

  - Legacy CSS organization is out of scope unless file moves require minor touchups.
  - This is a structural refactor first; user-visible behavior should not change.
  - Prefer feature co-location over generic shared utility files.
  - Shared modules must represent true reuse, not convenience dumping grounds.
  - Large data/assets stay out of scope except where lookup helpers depend on them.
  - Acceptance criterion for AI-readability: a typical task should require reading one feature README plus 1-
    3 code files, not broad repo search.


 
  Implement this plan?
