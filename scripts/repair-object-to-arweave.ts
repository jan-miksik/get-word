import * as dotenv from "dotenv";
import {
  uploadAudio,
  type UploadAudioTag,
} from "../lib/audio-storage";
import {
  getAudio,
  OBJECT_AUDIO_CONTENT_TYPE,
  type ObjectStorageProvider,
} from "../lib/object-storage";

dotenv.config({ path: ".env.local" });

const DEFAULT_BATCH_SIZE = 100;

type MediaAssetRow = {
  id: string;
  contentHash: string;
  language: string;
  textReference: string;
  provider: "google_tts" | "elevenlabs";
  storageType: "object_store";
  storageProvider: ObjectStorageProvider | null;
  createdAt: Date;
};

type Cursor = {
  createdAt: Date;
  id: string;
};

function getFlagValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getNumberFlag(name: string, fallback: number): number {
  const raw = getFlagValue(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRepairTags(asset: MediaAssetRow): UploadAudioTag[] {
  const tags: UploadAudioTag[] = [
    { name: "App-Name", value: "Get Word" },
    { name: "Content-Type", value: OBJECT_AUDIO_CONTENT_TYPE },
    { name: "Content-Hash", value: asset.contentHash },
    { name: "Storage-Repair", value: "object-to-arweave" },
  ];

  if (asset.language) tags.push({ name: "Language", value: asset.language });
  if (asset.provider) tags.push({ name: "TTS-Provider", value: asset.provider });
  if (asset.textReference) tags.push({ name: "Text-Reference", value: asset.textReference });
  return tags;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = getNumberFlag("--limit", Number.POSITIVE_INFINITY);
  const batchSize = Math.min(getNumberFlag("--batch-size", DEFAULT_BATCH_SIZE), DEFAULT_BATCH_SIZE);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
    process.exit(1);
  }

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { and, asc, eq, gt, or } = await import("drizzle-orm");
  const postgres = (await import("postgres")).default;
  const schema = await import("../lib/db/schema");
  const { normalizeDatabaseUrl } = await import("../lib/db/connection-string");

  const client = postgres(normalizeDatabaseUrl(connectionString), { max: 1, prepare: false });
  const db = drizzle(client);
  const summary = {
    scanned: 0,
    promoted: 0,
    dryRunReady: 0,
    missingObject: 0,
    missingProvider: 0,
    skippedConcurrent: 0,
    failed: 0,
  };

  console.log("[repair-object-to-arweave] starting", { dryRun, limit, batchSize });

  try {
    // Promoting a row flips storage_type to "arweave", removing it from this
    // filtered set, so an offset would skip un-promoted rows. Page with a stable
    // (createdAt, id) cursor that advances past every processed row regardless of
    // outcome — promoted rows leave the set, failed rows aren't retried in this run.
    let cursor: Cursor | null = null;
    while (summary.scanned < limit) {
      const rows = await db
        .select({
          id: schema.mediaAssets.id,
          contentHash: schema.mediaAssets.contentHash,
          language: schema.mediaAssets.language,
          textReference: schema.mediaAssets.textReference,
          provider: schema.mediaAssets.provider,
          storageType: schema.mediaAssets.storageType,
          storageProvider: schema.mediaAssets.storageProvider,
          createdAt: schema.mediaAssets.createdAt,
        })
        .from(schema.mediaAssets)
        .where(
          and(
            eq(schema.mediaAssets.storageType, "object_store"),
            eq(schema.mediaAssets.mediaType, "audio"),
            cursor
              ? or(
                  gt(schema.mediaAssets.createdAt, cursor.createdAt),
                  and(
                    eq(schema.mediaAssets.createdAt, cursor.createdAt),
                    gt(schema.mediaAssets.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(schema.mediaAssets.createdAt), asc(schema.mediaAssets.id))
        .limit(Math.min(batchSize, limit - summary.scanned));

      if (rows.length === 0) break;

      const assets = rows as MediaAssetRow[];
      cursor = { createdAt: assets[assets.length - 1].createdAt, id: assets[assets.length - 1].id };

      for (const asset of assets) {
        summary.scanned += 1;

        if (!asset.storageProvider) {
          summary.missingProvider += 1;
          console.warn("[repair-object-to-arweave] object_store row missing provider; skipped", {
            id: asset.id,
            contentHash: asset.contentHash,
          });
          continue;
        }

        const objectAudio = await getAudio(asset.contentHash, asset.storageProvider);
        if (!objectAudio) {
          summary.missingObject += 1;
          console.warn("[repair-object-to-arweave] object missing; row left unchanged", {
            id: asset.id,
            contentHash: asset.contentHash,
            provider: asset.storageProvider,
          });
          continue;
        }

        if (dryRun) {
          summary.dryRunReady += 1;
          console.log("[repair-object-to-arweave] dry-run would promote", {
            id: asset.id,
            contentHash: asset.contentHash,
            bytes: objectAudio.body.byteLength,
          });
          continue;
        }

        try {
          const uploaded = await uploadAudio(
            Buffer.from(objectAudio.body),
            {
              contentHash: asset.contentHash,
              language: asset.language,
              textReference: asset.textReference,
              provider: asset.provider,
            },
            { tags: buildRepairTags(asset) },
          );

          const updated = await db
            .update(schema.mediaAssets)
            .set({
              storageType: "arweave",
              storageProvider: null,
              storageRef: uploaded.storageRef,
            })
            .where(
              and(
                eq(schema.mediaAssets.id, asset.id),
                eq(schema.mediaAssets.storageType, "object_store"),
                eq(schema.mediaAssets.contentHash, asset.contentHash),
              ),
            )
            .returning({ id: schema.mediaAssets.id });

          if (updated.length === 0) {
            summary.skippedConcurrent += 1;
            console.warn("[repair-object-to-arweave] row changed before promotion; skipped", {
              id: asset.id,
              contentHash: asset.contentHash,
              uploadedRef: uploaded.storageRef,
            });
            continue;
          }

          summary.promoted += 1;
          console.log("[repair-object-to-arweave] promoted", {
            id: asset.id,
            contentHash: asset.contentHash,
            storageRef: uploaded.storageRef,
          });
        } catch (err) {
          summary.failed += 1;
          console.warn("[repair-object-to-arweave] Arweave upload failed; row left as object_store", {
            id: asset.id,
            contentHash: asset.contentHash,
            error: err instanceof Error ? err.message : err,
          });
        }
      }
    }
  } finally {
    await client.end();
  }

  console.log("[repair-object-to-arweave] summary", summary);
}

main().catch((err) => {
  console.error("[repair-object-to-arweave] failed:", err);
  process.exit(1);
});
