# Audio Arweave Storage

## Current decision

The first implementation keeps ArDrive Turbo upload logic inside the Next.js app.

Why this won:

- auth, DB writes, and list ownership rules already live in Next.js,
- the broken path was the editing flow itself, so the shortest safe fix is to complete that path in one place,
- a Worker would add another deployable service before we have proven volume or caching needs.

The Cloudflare Worker option is still valid later for caching, proxying, or isolating upload credentials, but it is deferred.

## Implemented flow

### Generate and persist

`POST /api/audio/generate/batch` now does all of the following:

1. authenticates the user,
2. computes a content hash from:
   - `text`
   - `language`
   - `provider`
   - `voice_id`
   - output format
3. checks `media_assets` for an existing matching hash,
4. reuses the existing asset when found,
5. otherwise generates TTS bytes,
6. uploads the bytes to Arweave with `@ardrive/turbo-sdk`,
7. writes `media_assets.storage_type='arweave'` and `storage_ref=<tx id>`,
8. links `word_list_items.audio_asset_id`,
9. returns `/api/audio/[hash]` as the playback URL.

### Playback

Playback always starts from the app URL:

```txt
/api/audio/:contentHash
```

The route looks up `media_assets` by `content_hash` and:

- redirects Arweave-backed assets to `${ARWEAVE_GATEWAY_URL}/${storage_ref}`,
- keeps legacy non-Arweave entries on the metadata fallback path.

This keeps the app URL stable even if the public gateway changes later.

## Data model

No schema change was required. The existing tables already support the final shape:

- `media_assets.content_hash`: dedup key
- `media_assets.storage_type`: `arweave`
- `media_assets.storage_ref`: Arweave transaction id
- `word_list_items.audio_asset_id`: link from word to stored media
- `word_list_items.audio_status`: `ready` or `failed` after processing

`content_hash` remains unique, and the insert path is idempotent so concurrent uploads for the same audio do not break on the unique constraint.

## Environment

Required for real uploads:

- `ARDRIVE_TURBO_WALLET_JWK`

Optional:

- `ARDRIVE_TURBO_UPLOAD_URL`
- `ARDRIVE_TURBO_PAYMENT_URL`
- `ARWEAVE_GATEWAY_URL`

`ARDRIVE_TURBO_WALLET_JWK` may be either:

- a single-line JWK JSON string, or
- a base64-encoded JWK JSON blob.

## Comparison with a Cloudflare Worker

### Next.js app

Pros:

- one deploy target,
- no duplicated auth/business logic,
- simplest local development,
- easiest path to save DB rows and link list items transactionally.

Cons:

- upload credentials live in the app runtime,
- no dedicated media edge/cache layer yet.

### Cloudflare Worker

Pros:

- better place for edge caching and gateway shielding,
- cleaner separation if we later add R2 cache or retry queues.

Cons:

- another service to deploy and monitor,
- more service-to-service auth,
- more surface area before the current feature is fully working.

## Deferred work

- optional Worker extraction for playback caching or upload isolation,
- optional R2 fallback or retry queue,
- migration of legacy `public/speech/*` assets into `media_assets`,
- per-word regenerate/provider switching beyond the current batch flow.
