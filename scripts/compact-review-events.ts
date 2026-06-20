/**
 * Compact server-side op logs that no longer need to be retained.
 *
 * What this deletes:
 *   - review_events older than 30 days. Their effects are already folded
 *     into user_progress by applyNewReviewEvents during live sync, and
 *     client dedupe is by clientEventId on the same row, not by anything
 *     in this table.
 *   - user_memory_hooks tombstones (deletedAt set) older than 365 days.
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

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const REVIEW_EVENTS_RETENTION_DAYS = 30;
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
  const tombstoneCutoff = daysAgo(MEMORY_HOOK_TOMBSTONE_RETENTION_DAYS);

  console.log("[compact] cutoffs:", {
    reviewEvents: reviewCutoff.toISOString(),
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
