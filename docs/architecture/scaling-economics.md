# Scaling — Economics, Cost Shifting, and Autoscaling

Companion to [scaling.md](./scaling.md). That file covers what to *build* at each scale.
This file covers what it *costs*, who *pays*, and how to make the system *grow itself*.

> Numbers are 2026 list prices, ballpark, USD/month. Treat them as planning anchors, not quotes.
> Assumptions: DAU ≈ 10–20 % of total users; concurrent ≈ 1–5 % of DAU; learning session ≈ 5 min,
> ~30 word reviews, ~10 audio plays, ~3 translation lookups; one-time cold-start fetch of words on first use, then
> incremental sync.

---

## 1. Cost vectors

Get Word's spend splits into four buckets. They scale very differently — that's why a flat "per-user cost" is misleading.

| Bucket | What's in it | Scales with |
|---|---|---|
| **Compute / Edge** | Vercel Functions, middleware, ISR, build minutes | Requests × duration. Fluid Compute reuses instances → mostly linear with active users. |
| **Database** | Supabase Postgres (storage, compute, egress, connections) | Total users + write volume of `user_progress` and `review_events`. Append-only tables dominate at scale. |
| **AI / TTS / Translation** | OpenRouter, Google TTS, ElevenLabs (and BYOK pass-through) | DAU × words generated. **The single largest variable cost.** |
| **Media / CDN** | ArDrive Turbo (one-time upload), Vercel CDN egress (every play) | Plays × bytes. Audio is content-addressed and dedup'd → uploads are sub-linear, egress is linear with DAU. |

The dominant bucket flips with scale:
- 10–1k users → fixed costs dominate (Vercel + Supabase floor).
- 1k–100k → AI/TTS dominates if not BYOK.
- 100k+ → DB + CDN egress dominate; AI is solved by either BYOK or contracts.

---

## 2. Price comparison by scale

Three deployment shapes, same product:

- **A. Cloud-only (current)** — Vercel + Supabase + Vercel-side AI keys.
- **B. BYOK / hybrid** — App provides infra; users plug in their own Google/OpenRouter/ElevenLabs keys (already supported via `/api/providers`). Free tier capped, paid tier unlocks server keys.
- **C. Local-first / P2P-assisted** — Heavy work runs on the user's device. Server is a thin coordination + sync layer. Optional paid cloud for users who don't want to run anything.

### 10 users
| Shape | Vercel | Supabase | AI/TTS | Media | **Total/mo** |
|---|---:|---:|---:|---:|---:|
| A | $0 (Hobby) | $0 (Free) | <$5 | <$1 | **~$5** |
| B | $0 | $0 | $0 (BYOK) | <$1 | **~$1** |
| C | $0 | $0 | $0 (on-device) | $0 | **$0** |

Architecture isn't the bottleneck here — product iteration is. Stay on A.

### 100 users
| Shape | Vercel | Supabase | AI/TTS | Media | **Total/mo** |
|---|---:|---:|---:|---:|---:|
| A | $20 (Pro) | $25 (Pro) | $20–80 | $2 | **~$70–125** |
| B | $20 | $25 | $5–15 | $2 | **~$50–60** |
| C | $20 | $25 | $0 | $2 | **~$50** |

**Inflection: Supabase Free dies (paused after 1 week inactivity, 500 MB cap).** Pro tier is non-negotiable. AI cost depends entirely on whether server keys are used.

### 1k users
| Shape | Vercel | Supabase | AI/TTS | Media | **Total/mo** |
|---|---:|---:|---:|---:|---:|
| A | $20–60 | $25 | $200–800 | $10–30 | **~$300–900** |
| B | $20–60 | $25 | $50–150 (paid users only) | $10–30 | **~$150–300** |
| C | $20 | $25 | $0–50 | $10–30 | **~$50–125** |

**First real divergence.** Shape A is still affordable but AI spend is now the dominant line item and unbounded against abuse. Hard rate limits per device + per user become mandatory regardless of shape.

### 10k users
| Shape | Vercel | Supabase | AI/TTS | Media | **Total/mo** |
|---|---:|---:|---:|---:|---:|
| A | $80–250 | $25–599 (Team) | $2k–10k | $200–600 | **~$2.3k–11k** |
| B | $80–250 | $25–599 | $400–1.5k | $200–600 | **~$700–3k** |
| C | $80 | $25 | $0–500 | $200–600 | **~$300–1.2k** |

**Inflection: shape A only works with revenue.** $2–10k/mo at 10k users = $0.20–1.00/user/mo just in infra; hard to recover under a free product. BYOK removes the AI cliff and pushes break-even out by ~10×.

### 100k users
| Shape | Vercel | Supabase / DB | AI/TTS | Media | **Total/mo** |
|---|---:|---:|---:|---:|---:|
| A | $500–2k | $599+ (Team) or dedicated $1.5k+ | $20k–100k | $2k–6k | **~$25k–110k** |
| B | $500–2k | $599–1.5k | $4k–15k (paid tier only) | $2k–6k | **~$7k–25k** |
| C | $200–1k (sync only) | $599 | $0–5k | $2k–6k | **~$3k–13k** |

**Shape A requires a real billing system or VC money.** Shape C — if technically achievable — is the only one with a sensible per-user cost (~$0.03–0.13/mo).

### Summary, $/user/month
| Users | A. Cloud | B. BYOK | C. Local-first |
|---:|---:|---:|---:|
| 10 | $0.50 | $0.10 | $0.00 |
| 100 | $1.00 | $0.55 | $0.50 |
| 1k | $0.60 | $0.22 | $0.09 |
| 10k | $0.65 | $0.18 | $0.06 |
| 100k | $0.65 | $0.16 | $0.05 |

The lesson: at 100k+ users, **shape A and shape C cost ~13× different**. The cost of "we host everything" is roughly an order of magnitude higher than "users host most of it."

---

## 3. Cost-shifting alternatives

Three orthogonal levers. Combine, don't pick one.

### Lever 1 — BYOK (already partially built)

`/api/providers/openrouter` and the provider keys table show this lever is partially in place. To turn it into a real cost shield:

- **Default to BYOK on free tier.** No server key access without payment or invitation.
- **Generous free per-user cap with server keys** (e.g. 50 audio gens / 200 translations per month) so the product is usable without setup.
- **Transparent meter UI.** The existing `GoogleUsagePanel` is the right pattern; extend to OpenRouter and ElevenLabs.
- **Encrypt keys at rest** (envelope encryption with KMS) — at 1k+ users this becomes a security/legal obligation, not a nice-to-have.
- **Refund/budget circuit breaker.** If a server-key cap is hit, fail closed with a clear "add your own key or upgrade" CTA, not a silent error.

Effect: removes the AI/TTS cost cliff entirely. Server-key cost is bounded by tier caps × paying users, not DAU.

### Lever 2 — Local-first compute

Shift compute *off* the server, onto the user's device. Browsers in 2026 can do a lot:

| Workload | On-device option | Trade-off |
|---|---|---|
| Translation | WASM models (Bergamot, ~30 MB per language pair) | Free, offline, ~80% quality of cloud. Good for word-level. |
| TTS | Web Speech API (free, OS voices) or [Piper](https://github.com/rhasspy/piper) WASM (~20 MB/voice, decent quality) | Free, instant, works offline. Quality below ElevenLabs but acceptable for learning. |
| Spaced repetition logic | Already client-side. Keep it that way. | None. |
| Sync | IndexedDB + service worker queue, push deltas only | More client code, but cuts sync cost to near-zero. |
| Audio storage | OPFS / Cache API for generated audio, content-addressed | Removes most CDN egress. ArDrive becomes a backup, not the hot path. |

**Two-tier UX:**
- **Local mode (free, default):** WebSpeech TTS + WASM translate + IndexedDB. Zero cost beyond sync.
- **Cloud mode (paid):** ElevenLabs/OpenRouter, ArDrive-backed audio, multi-device sync of generated assets.

The PWA setup ([sw.js](public/sw.js), [PWARegister.tsx](components/PWARegister.tsx)) is already in place — this is incremental, not a rewrite.

### Lever 3 — P2P / device-shared resources

Useful at 100k+ scale, niche before that. Get Word has natural fit because curated word lists are immutable, content-addressed, and shared across users.

- **Curated lists distributed via [Helia/IPFS](https://helia.io/)** — clients seed lists they've downloaded. Server only signs manifests.
- **Generated audio gossiped between peers** in same language. Content-addressed by hash already, so dedup is built in. Server is the trust anchor that says "yes, this hash is the official audio for this word."
- **Wallet-gated incentives** (Reown is already wired up) — users who seed get reduced quotas / free pro features. Aligns with the existing wallet auth pattern without forcing crypto on anyone.

Caveats: P2P only helps with read-heavy public content. User progress/state is private and must stay server-coordinated. Treat P2P as a *CDN replacement*, not a database replacement.

### The hybrid product surface

```
┌──────────────────────────────────────────────────────────────┐
│  User chooses tier on first run (changeable later):          │
│                                                              │
│  ⚪ Free + Local       — on-device TTS/translate, no signup  │
│  ⚪ Free + BYOK        — bring your own Google/OpenRouter    │
│  ⚪ Pro Cloud ($X/mo)  — we handle everything, multi-device  │
│  ⚪ Pro Self-host      — you run your own backend, $0 to us  │
└──────────────────────────────────────────────────────────────┘
```

The product *frames* infra cost as a user choice, not a hidden tax. This works because Get Word is a learning tool — users have time, and many will prefer privacy + free over polish.

---

## 4. Autoscaling: making the system grow itself

Autoscaling means humans don't make capacity decisions in the day-to-day. Different layers, different tools:

### Compute layer
- **Vercel Fluid Compute** is already autoscaling — instance reuse + concurrency. No action needed up to ~100k users.
- **Set per-route `maxDuration` and memory in [vercel.ts](vercel.ts)** to prevent runaway cost from a single slow route (translation/audio generation are the candidates).
- **At 100k+,** add Vercel **Rolling Releases** for safe rollouts and **regional pinning** for the sync route to keep DB latency low.

### Database layer
- **Supabase auto-pauses on Free** (bad for prod). Pro and above don't pause.
- **Supabase Compute add-ons** scale vertically; horizontal read replicas are available on Team+. Plan to enable replicas before 100k.
- **Connection pool**: PgBouncer/Supavisor in transaction mode is the only sane shape for serverless. The current `max: 3` per function is correct.
- **Auto-archival job** for `review_events` (scheduled cron, e.g. nightly) — move events older than 90 days to cold storage (Vercel Blob, S3 Glacier, or Supabase storage). Postgres is not your data warehouse.

### AI/TTS layer (the cost killer)
- **Per-user soft + hard caps** enforced at the route level, not the client. Soft cap = warning, hard cap = 429.
- **Provider failover via [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)**: route to cheaper models when traffic spikes; fall back to ElevenLabs only for paid tier.
- **Result caching** — translation results are deterministic by (word, source lang, target lang). Already content-hashed for audio; do the same for translation. A single Redis/Upstash cache hits ~70% on language-learning workloads (long tail of common words).
- **Job queue** for batch operations — already designed for at the 10k mark in [scaling.md §10k](./scaling.md). Vercel Queues (beta) or Upstash QStash are the lowest-friction options.

### Media layer
- **Content-addressed storage** is already in place via ArDrive — that's the right primitive.
- **CDN tiering**: hot audio on Vercel CDN (paid), warm on ArDrive gateway (~free), cold reconstructed from text via TTS on demand. Eviction is automatic because of content addressing.

### Cost-aware autoscaling rules
Codify these as monitors with alerts that trigger automated responses, not just pages:

| Signal | Auto-action |
|---|---|
| AI spend > 80% of monthly budget | Disable server keys for free tier; force BYOK. |
| Sync p95 > 2s for 5 min | Drop optional fields (review event detail) from response. |
| DB connection saturation > 90% | Reject non-essential routes (analytics, admin) with 503. |
| CDN egress > forecast × 1.5 | Lower default audio bitrate; warn paid tier is being subsidized. |

Each of these is a cheap script + a feature flag. None require new infra.

---

## 5. Recommended decision sequence

1. **Now (10–100 users)**: Pick the product shape. Are you building a free privacy-first learning tool, a paid cloud product, or both? The answer determines everything below.
2. **Before 1k**: Implement per-route + per-user rate limits. This is the single most valuable defensive change. Add cost dashboards (AI spend, DB rows, CDN bytes) per day, not per month.
3. **Before 10k**: Ship BYOK as the *default* path. Make server-key access gated (paid or invite). Add Web Speech / WASM translate as a free local mode.
4. **Before 100k**: Move to hybrid shape (B or C). Add a cache (Upstash Redis), a queue (Vercel Queues / QStash), and DB read replicas. Archive `review_events` older than 90 days.
5. **At 100k+**: The product decision (private learning state vs marketplace vs media platform) determines architecture, per [scaling.md §10m](./scaling.md). Until then, optimize for choice and reversibility — every user-tier mechanism above is independent and can be added without rewrites.

---

## 6. Brief overview — 1m to 10mld users

> The user explicitly asked for only a brief sketch above 1m. Detailed work belongs in [scaling.md](./scaling.md).

| Users | Dominant cost | Architectural shift | Cost-shift posture |
|---:|---|---|---|
| **1m** | DB writes, CDN egress | Sharded user state; event-stream writes; offline-first client mandatory. | BYOK is default for free tier; pro is a separate billing org. Vendor contracts for AI/TTS replace list-price spend. |
| **10m** | Multi-region DB, abuse | Service split (sync/content/media/provider/analytics). Regional shards. Dedicated identity. | P2P content distribution becomes net-positive. Self-host tier becomes a real product line. |
| **100m** | Compliance, governance, fraud | Multi-region active/active. Data residency. Formal SRE. Data lake replaces operational DB queries. | Federated model: official cloud + community-run instances + open protocol. Wallet-based identity is a cost lever, not just auth. |
| **1bn (1mld)** | Per-user inefficiency × scale | Edge-resident state. Compact binary sync protocol. AI generation is local or contracted at platform tier. | Most users on local-first / P2P. Paid cloud is a premium minority. Infra cost grows sub-linearly with users. |
| **10bn (10mld)** | Theoretical — beyond human population | Treat as stress test. Architecture must be designed *with* cloud/CDN/AI vendors, not *on top of* them. | Irrelevant; at this scale Get Word is a protocol with implementations, not an app. |

**The single insight**: above 1m users, the question isn't "how do we host this" but "how do we *not* host most of it." The cost-shifting levers in §3 aren't optimizations at that point — they're the architecture.
