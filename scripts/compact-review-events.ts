/**
 * Compact server-side op logs that no longer need to be retained.
 *
 * What this deletes:
 *   - review_events older than 30 days. Their effects are already folded
 *     into user_progress by applyNewReviewEvents during live sync, and
 *     client dedupe is by clientEventId on the same row, not by anything
 *     in this table.
 *   - processed_client_ops older than 365 days. THIS RETENTION IS LOAD-
 *     BEARING — see the invariant note below.
 *   - user_memory_hooks tombstones (deletedAt set) older than 365 days.
 *
 * INVARIANT — processed_client_ops retention MUST outlive any outbox op
 * sitting on any client. Otherwise this sequence breaks the
 * "no retried mutation applied twice" guarantee:
 *
 *   1. Client sends op; server applies it and records processed_client_ops.
 *   2. Response is lost in transit; client keeps op in outbox.
 *   3. User doesn't open the app for longer than the retention window.
 *   4. Compaction deletes the processed_client_ops row.
 *   5. User reopens app; drainer retries the old op.
 *   6. Server has no record → mutation applies a second time.
 *
 * As long as PROCESSED_CLIENT_OPS_RETENTION_DAYS >= the maximum outbox-op
 * lifetime on any client, retries remain idempotent. Do NOT shorten this
 * without first capping outbox-op expiresAt to a smaller window.
 *
 * Usage:
 *   pnpm tsx scripts/compact-review-events.ts            # dry run, prints counts
 *   pnpm tsx scripts/compact-review-events.ts --apply    # actually delete
 *
 * Idempotent — safe to re-run.
 */

import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { and, lt, isNotNull } from "drizzle-orm";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const REVIEW_EVENTS_RETENTION_DAYS = 30;
const PROCESSED_CLIENT_OPS_RETENTION_DAYS = 365;
const MEMORY_HOOK_TOMBSTONE_RETENTION_DAYS = 365;

function daysAgo(days: number): Date {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
    process.exit(1);
  }

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  const schema = await import("../lib/db/schema");

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  const reviewCutoff = daysAgo(REVIEW_EVENTS_RETENTION_DAYS);
  const opsCutoff = daysAgo(PROCESSED_CLIENT_OPS_RETENTION_DAYS);
  const tombstoneCutoff = daysAgo(MEMORY_HOOK_TOMBSTONE_RETENTION_DAYS);

  console.log("[compact] cutoffs:", {
    reviewEvents: reviewCutoff.toISOString(),
    processedClientOps: opsCutoff.toISOString(),
    memoryHookTombstones: tombstoneCutoff.toISOString(),
  });

  if (!apply) {
    console.log("[compact] DRY RUN — pass --apply to actually delete.");
  }

  try {
    if (apply) {
      const reviewDeleted = await db
        .delete(schema.reviewEvents)
        .where(lt(schema.reviewEvents.clientCreatedAt, reviewCutoff))
        .returning({ id: schema.reviewEvents.id });
      console.log(`[compact] review_events deleted: ${reviewDeleted.length}`);

      const opsDeleted = await db
        .delete(schema.processedClientOps)
        .where(lt(schema.processedClientOps.processedAt, opsCutoff))
        .returning({ id: schema.processedClientOps.id });
      console.log(`[compact] processed_client_ops deleted: ${opsDeleted.length}`);

      const tombstonesDeleted = await db
        .delete(schema.userMemoryHooks)
        .where(
          and(
            isNotNull(schema.userMemoryHooks.deletedAt),
            lt(schema.userMemoryHooks.deletedAt, tombstoneCutoff),
          ),
        )
        .returning({ id: schema.userMemoryHooks.id });
      console.log(`[compact] user_memory_hooks tombstones deleted: ${tombstonesDeleted.length}`);
    } else {
      const reviewCandidates = await db
        .select({ id: schema.reviewEvents.id })
        .from(schema.reviewEvents)
        .where(lt(schema.reviewEvents.clientCreatedAt, reviewCutoff));
      console.log(`[compact] review_events would delete: ${reviewCandidates.length}`);

      const opsCandidates = await db
        .select({ id: schema.processedClientOps.id })
        .from(schema.processedClientOps)
        .where(lt(schema.processedClientOps.processedAt, opsCutoff));
      console.log(`[compact] processed_client_ops would delete: ${opsCandidates.length}`);

      const tombstoneCandidates = await db
        .select({ id: schema.userMemoryHooks.id })
        .from(schema.userMemoryHooks)
        .where(
          and(
            isNotNull(schema.userMemoryHooks.deletedAt),
            lt(schema.userMemoryHooks.deletedAt, tombstoneCutoff),
          ),
        );
      console.log(`[compact] user_memory_hooks tombstones would delete: ${tombstoneCandidates.length}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[compact] failed:", err);
  process.exit(1);
});
