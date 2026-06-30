import * as dotenv from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getArweaveGatewayUrls } from "../lib/audio-storage";
import {
  getActiveObjectStorageProvider,
  hasAudio,
  listAudioContentHashes,
  putAudio,
  OBJECT_AUDIO_CONTENT_TYPE,
} from "../lib/object-storage";

dotenv.config({ path: ".env.local" });

const ARWEAVE_FETCH_TIMEOUT_MS = 3_500;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 10;
const MAX_CONCURRENCY = 16;

type MediaAssetRow = {
  id: string;
  contentHash: string;
  storageRef: string;
  createdAt: Date;
};

type Cursor = {
  createdAt: Date;
  id: string;
};

type BackfillResult =
  | { status: "alreadyPresent" }
  | { status: "mirrored" }
  | { status: "dryRunReady" }
  | { status: "failed" }
  | { status: "probeFailed" };

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

async function loadCheckpoint(checkpointPath: string): Promise<Cursor | null> {
  try {
    const raw = await readFile(checkpointPath, "utf8");
    const parsed = JSON.parse(raw) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("checkpoint must contain createdAt and id strings");
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("checkpoint createdAt is not a valid date");
    }

    console.log("[backfill-object-audio] loaded checkpoint", {
      checkpointPath,
      createdAt: createdAt.toISOString(),
      id: parsed.id,
    });
    return { createdAt, id: parsed.id };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }

    console.warn("[backfill-object-audio] checkpoint ignored", {
      checkpointPath,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

async function saveCheckpoint(checkpointPath: string, cursor: Cursor) {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(
    checkpointPath,
    `${JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
}

type UnresolvedAsset = { contentHash: string; status: BackfillResult["status"] };

// The scan cursor always advances to the end of each batch so a checkpointed
// resume keeps moving forward instead of stalling on a permanently dead
// Arweave ref. Assets that failed or could not be verified are therefore
// recorded separately so they are not silently dropped on resume.
async function saveFailures(failuresPath: string, failures: UnresolvedAsset[]) {
  await mkdir(path.dirname(failuresPath), { recursive: true });
  await writeFile(
    failuresPath,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), failures }, null, 2)}\n`,
    "utf8",
  );
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
        console.warn("[backfill-object-audio] gateway skipped", {
          url,
          status: response.status,
          contentType,
        });
        continue;
      }

      const body = await response.arrayBuffer();
      const bytes = new Uint8Array(body);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES || !looksLikeMp3(bytes)) {
        console.warn("[backfill-object-audio] gateway returned invalid audio bytes", {
          url,
          byteLength: bytes.byteLength,
          contentType,
        });
        continue;
      }

      return Buffer.from(body);
    } catch (err) {
      console.warn("[backfill-object-audio] gateway failed", {
        url,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function mirrorAsset(
  asset: MediaAssetRow,
  dryRun: boolean,
  existingObjectHashes: Set<string> | null,
): Promise<BackfillResult> {
  if (existingObjectHashes?.has(asset.contentHash)) {
    console.log("[backfill-object-audio] mirror already present", {
      contentHash: asset.contentHash,
    });
    return { status: "alreadyPresent" };
  }

  if (!existingObjectHashes) {
    const existing = await hasAudio(asset.contentHash);
    if (existing === true) {
      console.log("[backfill-object-audio] mirror already present", {
        contentHash: asset.contentHash,
      });
      return { status: "alreadyPresent" };
    }
    if (existing === null) {
      console.warn("[backfill-object-audio] could not verify object mirror state; skipped to avoid overwrite", {
        contentHash: asset.contentHash,
      });
      return { status: "probeFailed" };
    }
  }

  if (dryRun) {
    console.log("[backfill-object-audio] dry-run would mirror", {
      contentHash: asset.contentHash,
    });
    return { status: "dryRunReady" };
  }

  const audio = await fetchArweaveAudio(asset.storageRef);
  if (!audio) {
    console.warn("[backfill-object-audio] no valid Arweave audio found", {
      contentHash: asset.contentHash,
      storageRef: asset.storageRef,
    });
    return { status: "failed" };
  }

  const ok = await putAudio(audio, asset.contentHash, OBJECT_AUDIO_CONTENT_TYPE);
  if (ok) {
    // Keep the in-run inventory current so duplicate-contentHash assets later
    // in the scan are recognised as present instead of re-fetched and re-PUT.
    existingObjectHashes?.add(asset.contentHash);
    console.log("[backfill-object-audio] mirrored", {
      contentHash: asset.contentHash,
      bytes: audio.byteLength,
    });
    return { status: "mirrored" };
  }

  console.warn("[backfill-object-audio] object mirror write failed", {
    contentHash: asset.contentHash,
  });
  return { status: "failed" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const probeHead = process.argv.includes("--probe-head");
  const limit = getNumberFlag("--limit", Number.POSITIVE_INFINITY);
  const batchSize = Math.min(getNumberFlag("--batch-size", DEFAULT_BATCH_SIZE), DEFAULT_BATCH_SIZE);
  const concurrency = Math.min(getNumberFlag("--concurrency", DEFAULT_CONCURRENCY), MAX_CONCURRENCY);
  const checkpointPath = getFlagValue("--checkpoint");

  // Optional explicit provider override so the run cannot silently target the
  // wrong store via a half-set env. Must match the configured active provider.
  const providerFlag = getFlagValue("--provider");
  const activeProvider = getActiveObjectStorageProvider();
  if (providerFlag && providerFlag !== activeProvider) {
    console.error(
      `--provider=${providerFlag} does not match the configured object store (${activeProvider}). ` +
        "Set AUDIO_OBJECT_STORE_PROVIDER and the matching credentials.",
    );
    process.exit(1);
  }

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
    mirrored: 0,
    alreadyPresent: 0,
    skipped: 0,
    probeFailed: 0,
    failed: 0,
  };

  console.log("[backfill-object-audio] starting", {
    dryRun,
    probeHead,
    targetProvider: activeProvider,
    targetBucket: process.env.AUDIO_OBJECT_STORE_BUCKET ?? null,
    source: "arweave",
    limit,
    batchSize,
    concurrency,
    checkpointPath: checkpointPath ?? null,
  });

  const unresolved: UnresolvedAsset[] = [];

  try {
    // One paginated ListObjectsV2 sweep (Class C: ~1 op per 1000 objects) builds an
    // in-memory inventory so presence checks during the scan cost zero B2 ops. If the
    // listing fails we would otherwise fall back to a per-object HEAD (Class B), which
    // can blow B2's 2,500/day free Class B cap on a large bucket — so abort by default
    // and require an explicit --probe-head opt-in for small datasets.
    const existingObjectHashes = await listAudioContentHashes();
    if (existingObjectHashes) {
      console.log("[backfill-object-audio] loaded object inventory", {
        objects: existingObjectHashes.size,
      });
    } else if (probeHead) {
      console.warn("[backfill-object-audio] inventory listing unavailable; --probe-head set, falling back to per-object HEAD (Class B ops)");
    } else {
      console.error(
        "[backfill-object-audio] inventory listing failed and --probe-head was not set. " +
          "Per-object HEAD checks would consume Class B quota; aborting. " +
          "Re-run once listing works, or pass --probe-head for a small dataset.",
      );
      return;
    }

    let cursor = checkpointPath ? await loadCheckpoint(checkpointPath) : null;
    while (summary.scanned < limit) {
      const rows = await db
        .select({
          id: schema.mediaAssets.id,
          contentHash: schema.mediaAssets.contentHash,
          storageRef: schema.mediaAssets.storageRef,
          createdAt: schema.mediaAssets.createdAt,
        })
        .from(schema.mediaAssets)
        .where(
          and(
            eq(schema.mediaAssets.storageType, "arweave"),
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
      const results = await mapWithConcurrency(
        assets,
        concurrency,
        (asset) => mirrorAsset(asset, dryRun, existingObjectHashes),
      );

      summary.scanned += assets.length;
      results.forEach((result, index) => {
        if (result.status === "alreadyPresent") summary.alreadyPresent += 1;
        else if (result.status === "mirrored") summary.mirrored += 1;
        else if (result.status === "dryRunReady") summary.skipped += 1;
        else if (result.status === "probeFailed") {
          summary.probeFailed += 1;
          unresolved.push({ contentHash: assets[index].contentHash, status: result.status });
        } else {
          summary.failed += 1;
          unresolved.push({ contentHash: assets[index].contentHash, status: result.status });
        }
      });

      const last = assets[assets.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      if (checkpointPath && !dryRun) {
        await saveCheckpoint(checkpointPath, cursor);
      }
    }
  } finally {
    await client.end();
    if (checkpointPath && !dryRun && unresolved.length > 0) {
      const failuresPath = `${checkpointPath}.failures.json`;
      await saveFailures(failuresPath, unresolved);
      console.warn("[backfill-object-audio] recorded unresolved assets for retry", {
        failuresPath,
        count: unresolved.length,
      });
    }
  }

  console.log("[backfill-object-audio] summary", summary);
}

main().catch((err) => {
  console.error("[backfill-object-audio] failed:", err);
  process.exit(1);
});
