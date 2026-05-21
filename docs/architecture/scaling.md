# Scaling Get Word

This is an order-of-magnitude scaling plan for the current Get Word app.

Assumptions:

- "Used by N users" means total registered or device users, not all online at once.
- Rough planning ratios: daily active users are 5-20% of total users, and peak concurrent users are 1-5% of daily active users.
- "1mld" means 1 billion users, and "10mld" means 10 billion users.
- Current stack: Next.js on Vercel, Supabase Postgres through Drizzle, device/session auth, client-side learning state, `/api/sync`, list editing, batch translation, batch audio generation, Arweave/ArDrive media storage, and third-party AI/TTS providers.

## Current Shape

The app is already a good small-to-medium web app architecture:

- Static/reactive UI can scale well through Vercel/CDN.
- Vocabulary display is mostly client-side and uses virtualization for long lists.
- Postgres is the source of truth for users, progress, memory hooks, category filters, lists, media assets, provider keys, API usage, and review events.
- `/api/sync` is the central hot path. It reads/writes user preferences, progress, review events, memory hooks, filters, then returns a full user snapshot plus hydrated list data.
- Translation and audio generation are synchronous API route flows today: request comes in, quota is checked, third-party API calls happen, DB rows are updated, and the HTTP request returns results.
- DB client is configured for serverless with a small connection pool (`max: 3`) and Supabase pooler is recommended for production.

This can carry early usage nicely, but the main scaling risk is that one user action may touch many DB rows and sometimes external APIs.

## Main Bottlenecks

| Area | Why it matters | First signs of pain |
|---|---|---|
| `/api/sync` payload size | Full progress/hooks/lists are returned repeatedly. Cost grows with words per user and subscribed lists. | Slow app startup, large JSON responses, Vercel function duration spikes. |
| Postgres writes | `user_progress` and `review_events` grow with every learning action. | Lock/contention on upserts, high CPU, slow indexes, rising storage. |
| DB connections | Serverless functions can fan out many short-lived DB clients. | Pool saturation, timeouts, queueing, intermittent 500s. |
| List hydration | `getHydratedWordListData` fetches subscribed/owned list items and category metadata on sync. | Sync gets slower as users subscribe to many lists. |
| Translation/TTS | Third-party APIs are slow, rate-limited, and expensive. | HTTP timeouts, quota failures, unpredictable latency. |
| Audio/media delivery | Media can become bandwidth-heavy even if app data is small. | High egress, slow playback, cache misses. |
| Device identity | Device IDs are lightweight but weak for abuse control and cross-device account integrity. | Spam accounts, quota abuse, account recovery issues. |
| Observability | At scale, unknown failures become expensive. | Users report issues before dashboards do. |

## Scale Summary

| Users | What likely changes | Architecture posture |
|---:|---|---|
| 10 | Nothing major. Local/dev style operations still work. Manual DB inspection is enough. | Vercel + Supabase is more than enough. Keep migrations clean. |
| 100 | Need basic production hygiene: backups, env separation, error visibility, privacy/security review for stored keys. | Still one app, one DB. Add uptime/error monitoring and make backups routine. |
| 1k | Real usage patterns appear. Sync payload size, slow routes, and third-party API costs become visible. | Add metrics per route, DB query timing, rate limits, and usage dashboards. |
| 10k | Hot paths need optimization. Full sync may become wasteful. Translation/audio should not be long synchronous requests. | Add incremental sync, cache public/curated lists, queue slow provider work. |
| 100k | DB and provider throughput become product constraints. Need deliberate data retention and cost controls. | Separate read-heavy public data from user state, add background workers, introduce Redis/queue/cache. |
| 1m | Single-region Postgres can still work only with careful partitioning and clear hot-path limits. | Read replicas, partition append-only events, async pipelines, SLOs, on-call playbooks. |
| 10m | Multi-service architecture becomes justified. One Next.js app talking directly to one DB is too tight. | Split sync, content, media, provider, auth, and analytics services. Multi-region CDN and replicated reads. |
| 100m | Global reliability, abuse, billing, and data governance dominate. Product features need platform foundations. | Multi-region active/active or active/passive, sharded user data, dedicated data platform, formal SRE. |
| 1mld | This is internet-scale. The app must be designed around regional shards, offline-first clients, and event streams. | Global control plane plus regional data planes. Strong automation, capacity planning, and compliance. |
| 10mld | Larger than the current number of humans. Treat as extreme theoretical scale. | Requires planet-scale architecture, partnerships with cloud/CDN/provider vendors, and aggressive edge/local processing. |

## By User Count

### 10 users

Current architecture is fine.

What matters:

- Keep Supabase migrations reproducible.
- Use Vercel preview/prod environments.
- Avoid manual DB edits unless documented.
- Keep seed data and word list migration scripts healthy.

Biggest risk: product iteration speed, not infrastructure.

### 100 users

Still fine with the current architecture.

Add:

- Error tracking for API routes and React runtime errors.
- Scheduled DB backups and restore drills.
- Basic route timing dashboards using the existing sync timing headers/logs.
- Simple abuse limits for expensive routes: translation, audio generation, provider OAuth.
- Clear quota messaging for Google/OpenRouter/ElevenLabs/ArDrive.

Watch:

- `/api/sync` p95 latency.
- Supabase connection pool usage.
- Translation and TTS spend.

### 1k users

The app starts needing operational discipline.

Add:

- Structured logs with request IDs for all API routes.
- Per-route p50/p95/p99 latency.
- DB slow query logging.
- Index review for `user_progress`, `review_events`, `word_list_items`, `user_list_subscriptions`, and `media_assets`.
- Rate limits per user/device/IP for all expensive routes.
- Background cleanup for expired OAuth/rate-limit buckets.

Likely code changes:

- Limit sync body size.
- Cap max list subscriptions/items returned in one sync response.
- Add pagination or revision-based loading for list items.
- Make client retries back off with jitter.

### 10k users

The first meaningful architecture change should happen here.

Change:

- Replace full-state sync with incremental sync:
  - Client sends `last_sync_revision`.
  - Server returns only changed progress/hooks/preferences/list metadata.
  - Large list item payloads are versioned and cached separately.
- Move translation and audio generation to jobs:
  - API route creates a job.
  - Worker processes batches.
  - Client polls or receives status updates.
- Cache public/curated vocabulary lists behind CDN or Redis.
- Add idempotency keys to mutation-heavy endpoints.

Why:

- Full snapshots waste DB, network, and client parse time.
- Third-party API work should not occupy request/response time.
- Slow provider calls should not block Vercel function capacity.

### 100k users

Postgres is now a shared critical system, not just a convenient database.

Change:

- Use Supabase Pro/Team or dedicated Postgres capacity.
- Add read replicas for list/content reads.
- Partition or archive `review_events` by time.
- Keep only recent detailed review events in the hot DB if analytics does not need all raw events online.
- Introduce Redis or another low-latency cache for:
  - public lists,
  - list metadata,
  - rate limits,
  - provider job status.
- Move generated media delivery fully behind CDN/gateway caching.
- Add a worker platform for translation/audio/provider jobs.

Likely DB shape:

- `users`: 100k rows, easy.
- `user_progress`: can be tens or hundreds of millions of rows depending on words per user.
- `review_events`: can grow faster than progress because it is append-only.
- `word_list_items`: manageable unless user-generated lists become central to the product.

### 1m users

The app needs clear separation between product data, user state, and analytics.

Change:

- Split hot user state from content:
  - User progress/preferences/hooks in one operational path.
  - Public vocabulary/list content in cache/read replicas.
  - Review analytics in an event/data pipeline.
- Partition `user_progress` and `review_events` by user hash or time.
- Use queue-based ingestion for review events.
- Make the client offline-first:
  - record local review events,
  - sync in batches,
  - resolve conflicts by server revision/event id.
- Introduce service-level objectives:
  - sync p95,
  - app load p95,
  - job completion time,
  - provider failure rate.

At this scale, "one route returns everything" should be gone.

### 10m users

One app server layer and one operational DB are no longer enough.

Change:

- Split services:
  - Sync service.
  - Content/list service.
  - Media service.
  - Provider key and OAuth service.
  - Translation/audio job service.
  - Analytics/event ingestion service.
- Shard user-owned data by user id.
- Put content/list reads on globally cached immutable versions.
- Use object storage/CDN for all media and generated static assets.
- Add fraud/abuse systems for free-tier APIs and BYOK misuse.
- Build admin tooling for support, migrations, data deletion, and incident response.

Key product decision:

- Decide whether Get Word is mostly private learning state, a marketplace of public word lists, or an AI media generation platform. Each one stresses different systems.

### 100m users

The hardest problems shift from code to platform operations.

Change:

- Multi-region architecture.
- Regional data residency strategy.
- Dedicated identity/auth system.
- Dedicated billing/quota/entitlement system.
- Data warehouse/lake for analytics instead of querying operational Postgres.
- Automated capacity forecasting.
- Formal incident management and rollback systems.
- Vendor contracts for CDN, AI providers, TTS providers, and storage.

Technical direction:

- User state is sharded and region-local.
- Public content is distributed globally as versioned immutable artifacts.
- Review events stream through Kafka/Pub/Sub/Kinesis-style infrastructure.
- Provider jobs run through queues with strict budget, retry, and circuit-breaker controls.

### 1mld users

At 1 billion users, the current product architecture is a conceptual prototype, not a scalable base.

Required shape:

- Regional shards with automated placement and migration.
- Offline-first clients that can operate for long periods without server round trips.
- Edge-delivered content and media.
- Extremely compact sync protocol.
- Event streams as the primary write path.
- Async materialized views for progress summaries and dashboards.
- Dedicated anti-abuse, compliance, privacy, support, and reliability teams.

Important constraint:

- Even tiny per-user inefficiencies become huge. A 10 KB unnecessary sync response for 100 million daily users is about 1 TB/day of avoidable transfer.

### 10mld users

This is beyond normal consumer-app planning and exceeds the current human population. Treat it as a theoretical stress test.

Required shape:

- Almost all common reads served from edge caches or local-first device state.
- Writes are compressed, batched, regional, and eventually consistent where possible.
- No synchronous dependency on external AI/TTS providers for core learning flows.
- Generated content must be deduplicated globally.
- Data retention must be aggressive and policy-driven.
- Architecture must be planned with cloud/CDN/database vendors directly.

At this scale, the only viable system is one where the central backend handles coordination and durable state, while most learning interaction happens locally or at the edge.

## Migration Path

### Phase 1: 10-1k users

- Keep the monolith.
- Add monitoring, backups, rate limits, and query timing.
- Keep schema migrations disciplined.
- Track API/provider cost per user.

### Phase 2: 1k-10k users

- Add incremental sync.
- Cache public list/content responses.
- Move translation and audio generation into background jobs.
- Add idempotency for sync/review events/jobs.
- Add payload size limits and pagination.

### Phase 3: 10k-100k users

- Add Redis or managed cache.
- Add a real queue and worker service.
- Add read replicas.
- Partition/archive append-only review events.
- Move analytics out of the operational DB.

### Phase 4: 100k-1m users

- Split content, sync, media, provider, and analytics responsibilities.
- Shard or partition user-heavy tables.
- Version public content artifacts.
- Add SLOs, incident playbooks, and capacity forecasts.

### Phase 5: 1m+ users

- Multi-region user data.
- Edge-first public content/media.
- Event-stream-first writes.
- Dedicated platform teams and vendor contracts.

## Near-Term Recommendations

Do these before the app reaches serious public usage:

1. Add route metrics for `/api/sync`, `/api/translate/batch`, `/api/audio/generate/batch`, `/api/lists`, and provider OAuth routes.
2. Add hard body-size and item-count limits to sync, not only translation/audio.
3. Add incremental sync with revisions so the app does not return all progress and list data every time.
4. Move translation and audio generation to background jobs.
5. Cache public/default word lists independently from user progress.
6. Review indexes with realistic data volumes, especially `user_progress(user_id, word_list_item_id)`, `review_events(user_id, server_created_at)`, `word_list_items(list_id, category_id, position)`, and subscription lookups.
7. Define retention for raw review events.
8. Add per-user and per-device quotas for expensive routes.
9. Keep generated audio content-addressed and globally deduplicated.
10. Build a small admin dashboard for provider usage, failed jobs, quota issues, and slow syncs.

## Biggest Design Principle

At small scale, optimize for shipping. At medium scale, optimize the hot path. At large scale, make the client local-first and make the backend incremental, asynchronous, cached, and partitioned.
