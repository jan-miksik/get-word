# Operator and Maintenance Scripts

Root-level `scripts/*.{ts,js}` files are operator-facing entrypoints and are
listed explicitly in Knip. Shared implementation belongs in `scripts/lib` when
it is tooling-only, or in the owning feature/server module when runtime and
operator workflows share the behavior.

## Groups

- Database backup/migration: `backup-*.sh`, `production-db.sh`,
  `dump-and-restore*.sh`, `run-migrations.ts`
- Landing generation: `generate-landing-demo-words.ts`, `generate-demo-audio.ts`,
  `generate-bundled-demo-audio.ts`
- Audio repair/storage: `check-object-storage.ts`, `backfill-object-audio.ts`,
  `repair-list-audio.ts`, `repair-object-to-arweave.ts`
- Data maintenance: `backfill-content-keys.ts`, `compact-review-events.ts`,
  `process-account-deletion-jobs.ts`
- School pilot access: `school-access.ts`
- Per-account feature limits: `user-limits.ts`
- Goal-onboarding rehearsal: `reset-goal-onboarding.ts` (staging only; it drops
  a learner's goal history and day snapshots to replay the release interstitial)

## Development guardrails

- `check-feature-boundaries.mjs` rejects new internal imports across features.
- `check-ai-context-budgets.mjs` prevents orchestration hotspots from silently
  growing back past their ratcheted line budgets. Generated/declarative data and
  tests are excluded; update a budget only when growth is intentional.

`scripts/lib/audio-quality.ts` is the canonical ffprobe/ffmpeg quality policy for
both landing-audio generators. Scripts may perform destructive production work;
preserve their dry-run/confirmation guards and never invoke them as part of the
normal test or build pipeline.
