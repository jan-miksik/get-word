import * as dotenv from "dotenv";
import { getArweaveGatewayUrls } from "../lib/audio-storage";
import {
  getAudio,
  putAudio,
  R2_AUDIO_CONTENT_TYPE,
} from "../lib/r2-storage";

dotenv.config({ path: ".env.local" });

const ARWEAVE_FETCH_TIMEOUT_MS = 3_500;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 100;

type MediaAssetRow = {
  id: string;
  contentHash: string;
  storageRef: string;
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

function looksLikeMp3(bytes: Uint8Array): boolean {
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return id3 || frameSync;
}

function acceptableContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized === "" ||
    normalized.includes("audio/mpeg") ||
    normalized.includes("octet-stream")
  );
}

async function fetchArweaveAudio(storageRef: string) {
  for (const url of getArweaveGatewayUrls(storageRef)) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
        },
        signal: AbortSignal.timeout(ARWEAVE_FETCH_TIMEOUT_MS),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !acceptableContentType(contentType)) {
        console.warn("[backfill-r2-audio] gateway skipped", {
          url,
          status: response.status,
          contentType,
        });
        continue;
      }

      const body = await response.arrayBuffer();
      const bytes = new Uint8Array(body);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES || !looksLikeMp3(bytes)) {
        console.warn("[backfill-r2-audio] gateway returned invalid audio bytes", {
          url,
          byteLength: bytes.byteLength,
          contentType,
        });
        continue;
      }

      return Buffer.from(body);
    } catch (err) {
      console.warn("[backfill-r2-audio] gateway failed", {
        url,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return null;
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
    mirrored: 0,
    alreadyPresent: 0,
    skipped: 0,
    failed: 0,
  };

  console.log("[backfill-r2-audio] starting", { dryRun, limit, batchSize });

  try {
    let offset = 0;
    while (summary.scanned < limit) {
      const rows = await db
        .select({
          id: schema.mediaAssets.id,
          contentHash: schema.mediaAssets.contentHash,
          storageRef: schema.mediaAssets.storageRef,
        })
        .from(schema.mediaAssets)
        .where(
          and(
            eq(schema.mediaAssets.storageType, "arweave"),
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
        const existing = await getAudio(asset.contentHash);
        if (existing) {
          summary.alreadyPresent += 1;
          console.log("[backfill-r2-audio] mirror already present", {
            contentHash: asset.contentHash,
          });
          continue;
        }

        const audio = await fetchArweaveAudio(asset.storageRef);
        if (!audio) {
          summary.failed += 1;
          console.warn("[backfill-r2-audio] no valid Arweave audio found", {
            contentHash: asset.contentHash,
            storageRef: asset.storageRef,
          });
          continue;
        }

        if (dryRun) {
          summary.skipped += 1;
          console.log("[backfill-r2-audio] dry-run would mirror", {
            contentHash: asset.contentHash,
            bytes: audio.byteLength,
          });
          continue;
        }

        const ok = await putAudio(audio, asset.contentHash, R2_AUDIO_CONTENT_TYPE);
        if (ok) {
          summary.mirrored += 1;
          console.log("[backfill-r2-audio] mirrored", {
            contentHash: asset.contentHash,
            bytes: audio.byteLength,
          });
        } else {
          summary.failed += 1;
          console.warn("[backfill-r2-audio] R2 mirror write failed", {
            contentHash: asset.contentHash,
          });
        }
      }
    }
  } finally {
    await client.end();
  }

  console.log("[backfill-r2-audio] summary", summary);
}

main().catch((err) => {
  console.error("[backfill-r2-audio] failed:", err);
  process.exit(1);
});
