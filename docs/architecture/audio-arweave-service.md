# Audio Arweave Service

## Goal

Replace local audio file storage with an upload flow that:

1. uploads audio to Arweave,
2. returns a stable path/URL for playback,
3. saves the uploaded asset in the database,
4. keeps the existing dedup model based on `content_hash`.

## Recommendation

Use a two-part service in this repo:

- `Next.js API route` as the authenticated orchestrator
- `Cloudflare Worker` as the media edge service

This is the best fit for the current app because:

- the app already runs as a standard Next.js backend and owns auth, list updates, and DB writes,
- the code already expects a media worker boundary via `MEDIA_PROXY_WORKER_URL`,
- Arweave upload and audio delivery fit well behind a Worker,
- keeping it in this repo avoids contract drift between the app and the media service.

## Recommended Ownership

### Next.js route

Own this in the app:

- validate session and permissions,
- compute `content_hash`,
- check DB dedup in `media_assets`,
- call the Worker only when upload is needed,
- save the returned Arweave reference in Postgres,
- link the saved asset to `word_list_items`,
- return the final audio URL to the client.

### Cloudflare Worker

Own this in the Worker:

- receive audio bytes,
- upload bytes to Arweave,
- optionally cache bytes in R2,
- return normalized storage metadata,
- serve audio by `content_hash` or stored reference.

## Why Not Let the Worker Write Directly to Postgres

You can do it, but I would not make that the first version.

Problems:

- the Worker then needs direct database credentials,
- auth and business rules become split between Next.js and the Worker,
- upload errors and DB errors become harder to reconcile,
- local development gets more complicated.

Better split:

- Worker handles storage,
- Next.js handles application state and database writes.

From the product perspective this is still one "service": the app endpoint uploads, saves in DB, and returns the path.

## Proposed Flow

### Happy path

1. Client calls `POST /api/audio/upload`.
2. Next.js authenticates the user.
3. Next.js computes `content_hash` from:
   - `text`
   - `language`
   - `provider`
   - `voice_id`
   - any TTS settings that affect output
4. Next.js checks `media_assets` for existing `content_hash`.
5. If found:
   - return the existing path,
   - link it to the word if needed,
   - skip Arweave upload.
6. If not found:
   - Next.js sends the audio bytes to the Worker,
   - Worker uploads to Arweave,
   - Worker returns `storage_type`, `storage_ref`, and a public path,
   - Next.js inserts a `media_assets` row,
   - Next.js links `word_list_items.audio_asset_id`,
   - Next.js returns the final path.

### Playback path

1. Client requests the app-provided audio URL.
2. URL resolves to Worker media endpoint.
3. Worker serves from cache if available.
4. On cache miss, Worker fetches from Arweave and can repopulate cache.

## API Contract

### App route

`POST /api/audio/upload`

Request:

```json
{
  "itemId": "uuid",
  "text": "xin chao",
  "language": "vi",
  "provider": "google_tts",
  "voice_id": "default",
  "audio_base64": "..."
}
```

Response:

```json
{
  "status": "ok",
  "content_hash": "sha256...",
  "storage_type": "arweave",
  "storage_ref": "arweave_tx_id",
  "audio_url": "https://media.example.com/audio/sha256..."
}
```

### Worker route

`POST /upload`

Request body:

- prefer raw bytes or multipart upload,
- avoid JSON base64 for the long-term implementation,
- include metadata in headers or form fields.

Response:

```json
{
  "storage_type": "arweave",
  "storage_ref": "arweave_tx_id",
  "audio_url": "https://media.example.com/audio/sha256..."
}
```

### Worker serve route

`GET /audio/:hash`

Behavior:

- resolve DB-independent media path by `content_hash`,
- serve cached bytes when possible,
- fall back to Arweave object fetch,
- return correct `Content-Type` and cache headers.

## Database Model

The existing schema already supports this shape through `media_assets` and `word_list_items`.

Recommended stored values:

- `media_assets.content_hash`: app-level dedup key
- `media_assets.storage_type`: `arweave`
- `media_assets.storage_ref`: Arweave transaction id
- `media_assets.media_type`: `audio`
- `media_assets.language`: source language
- `media_assets.text_reference`: text used to generate the file
- `media_assets.provider`: `google_tts` or `elevenlabs`
- `media_assets.size_bytes`: uploaded byte size

The user-facing playback URL should be derived, not stored as the primary source of truth.

Recommended derived URL:

```txt
${MEDIA_PROXY_WORKER_URL}/audio/${content_hash}
```

This keeps playback stable even if the underlying Arweave gateway strategy changes.

## Important Changes To Make

### 1. Include voice settings in the hash

Current hashing only uses `text`, `language`, and `provider`. That is not enough if different voices can generate different files for the same text.

The hash input should include:

- `text`
- `language`
- `provider`
- `voice_id`
- codec or format
- any generation options that affect audio bytes

### 2. Do not use local fake storage in production paths

Current fallback behavior returns a local marker such as `local:${contentHash}`. That is fine only for local development.

For production:

- upload must succeed to Arweave,
- or fail clearly,
- or intentionally fall back to R2 if you still want a backup path.

### 3. Make insert idempotent

`content_hash` is unique. Use an upsert or "insert, then select on conflict" pattern so concurrent uploads of the same content do not fail unpredictably.

### 4. Authenticate calls from Next.js to the Worker

Do not expose unauthenticated upload endpoints publicly.

Use one of:

- shared secret header,
- signed HMAC request,
- Cloudflare Access or service-to-service auth.

### 5. Prefer binary upload over base64

Base64 adds size overhead and unnecessary CPU work. Use:

- `multipart/form-data`, or
- raw `application/octet-stream`.

## Suggested Folder Structure

```txt
app/api/audio/upload/route.ts
lib/audio.ts
lib/audio-storage.ts
workers/media-proxy/src/index.ts
workers/media-proxy/wrangler.toml
docs/architecture/audio-arweave-service.md
```

## Suggested Implementation Plan

1. Create `workers/media-proxy`.
2. Implement `POST /upload` in the Worker.
3. Implement `GET /audio/:hash` in the Worker.
4. Add `MEDIA_PROXY_WORKER_URL` to env docs.
5. Add a new app route `POST /api/audio/upload`.
6. Move DB write logic into a small service module such as `lib/audio-storage.ts`.
7. Update existing batch generation flow to call the new storage module.
8. Add tests for:
   - dedup hit,
   - new upload,
   - duplicate concurrent upload,
   - Worker upload failure,
   - DB insert conflict,
   - playback URL generation.

## Final Recommendation

For this repo, the best version is:

- keep the media service in this repo,
- deploy the upload/serve layer as a Cloudflare Worker,
- keep DB writes in Next.js,
- return a Worker URL as the stable playback path,
- store only normalized Arweave metadata in `media_assets`.

That gives you the behavior you want without pushing app-state responsibilities into a separate infrastructure service too early.
