import * as dotenv from "dotenv";
import {
  uploadAudio,
  type UploadAudioTag,
} from "../lib/audio-storage";
import { getAudio, R2_AUDIO_CONTENT_TYPE } from "../lib/r2-storage";

dotenv.config({ path: ".env.local" });

const DEFAULT_BATCH_SIZE = 100;

type MediaAssetRow = {
  id: string;
  contentHash: string;
  language: string;
  textReference: string;
  provider: "google_tts" | "elevenlabs";
  storageType: "r2";
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
    { name: "Content-Type", value: R2_AUDIO_CONTENT_TYPE },
    { name: "Content-Hash", value: asset.contentHash },
    { name: "Storage-Repair", value: "r2-to-arweave" },
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
  const { and, asc, eq } = await import("drizzle-orm");
  const postgres = (await import("postgres")).default;
  const schema = await import("../lib/db/schema");
  const { normalizeDatabaseUrl } = await import("../lib/db/connection-string");

  const client = postgres(normalizeDatabaseUrl(connectionString), { max: 1, prepare: false });
  const db = drizzle(client);
  const summary = {
    scanned: 0,
    promoted: 0,
    dryRunReady: 0,
    missingR2: 0,
    skippedConcurrent: 0,
    failed: 0,
  };

  console.log("[repair-r2-to-arweave] starting", { dryRun, limit, batchSize });

  try {
    let offset = 0;
    while (summary.scanned < limit) {
      const rows = await db
        .select({
          id: schema.mediaAssets.id,
          contentHash: schema.mediaAssets.contentHash,
          language: schema.mediaAssets.language,
          textReference: schema.mediaAssets.textReference,
          provider: schema.mediaAssets.provider,
          storageType: schema.mediaAssets.storageType,
        })
        .from(schema.mediaAssets)
        .where(
          and(
            eq(schema.mediaAssets.storageType, "r2"),
            eq(schema.mediaAssets.mediaType, "audio"),
          ),
        )
        .orderBy(asc(schema.mediaAssets.createdAt))
        .limit(Math.min(batchSize, limit - summary.scanned))
        .offset(offset);

      if (rows.length === 0) break;
      offset += rows.length;

      for (const asset of rows as MediaAssetRow[]) {
        summary.scanned += 1;
        const r2Audio = await getAudio(asset.contentHash);
        if (!r2Audio) {
          summary.missingR2 += 1;
          console.warn("[repair-r2-to-arweave] R2 object missing; row left unchanged", {
            id: asset.id,
            contentHash: asset.contentHash,
          });
          continue;
        }

        if (dryRun) {
          summary.dryRunReady += 1;
          console.log("[repair-r2-to-arweave] dry-run would promote", {
            id: asset.id,
            contentHash: asset.contentHash,
            bytes: r2Audio.body.byteLength,
          });
          continue;
        }

        try {
          const uploaded = await uploadAudio(
            Buffer.from(r2Audio.body),
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
              storageRef: uploaded.storageRef,
            })
            .where(
              and(
                eq(schema.mediaAssets.id, asset.id),
                eq(schema.mediaAssets.storageType, "r2"),
                eq(schema.mediaAssets.contentHash, asset.contentHash),
              ),
            )
            .returning({ id: schema.mediaAssets.id });

          if (updated.length === 0) {
            summary.skippedConcurrent += 1;
            console.warn("[repair-r2-to-arweave] row changed before promotion; skipped", {
              id: asset.id,
              contentHash: asset.contentHash,
              uploadedRef: uploaded.storageRef,
            });
            continue;
          }

          summary.promoted += 1;
          console.log("[repair-r2-to-arweave] promoted", {
            id: asset.id,
            contentHash: asset.contentHash,
            storageRef: uploaded.storageRef,
          });
        } catch (err) {
          summary.failed += 1;
          console.warn("[repair-r2-to-arweave] Arweave upload failed; row left as r2", {
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

  console.log("[repair-r2-to-arweave] summary", summary);
}

main().catch((err) => {
  console.error("[repair-r2-to-arweave] failed:", err);
  process.exit(1);
});
