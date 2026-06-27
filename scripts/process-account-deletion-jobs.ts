/**
 * Retry processor for `account_deletion_jobs`.
 *
 * Each row means: a user's app data was erased, but their Supabase `auth.users`
 * identity still needs to be deleted (the external call failed, or the process
 * crashed right after the deletion transaction committed). This drains pending
 * jobs: retry the Supabase admin delete, remove the row on success, and bump
 * attempts + record a (truncated) error on failure so it surfaces and can be
 * alerted on.
 *
 * Usage:
 *   pnpm tsx scripts/process-account-deletion-jobs.ts
 *
 * Intended to run on a schedule (cron) or by hand. Idempotent and safe to
 * re-run. A row that fails repeatedly (high `attempts`) needs manual attention.
 */

import * as dotenv from "dotenv";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

// Dynamic imports so dotenv loads before the db client reads DATABASE_URL.
const { getPendingAccountDeletionJobs, deleteAccountDeletionJob, bumpAccountDeletionJobAttempt } =
  await import("../lib/db/queries/account-deletion-jobs");
const { deleteSupabaseAuthUser } = await import("../features/auth/supabase/admin");

const ALERT_AFTER_ATTEMPTS = 5;

async function main() {
  const jobs = await getPendingAccountDeletionJobs();
  if (jobs.length === 0) {
    console.log("[deletion-jobs] No pending jobs.");
    return;
  }
  console.log(`[deletion-jobs] Processing ${jobs.length} pending job(s)…`);

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await deleteSupabaseAuthUser(job.supabaseAuthId);
      await deleteAccountDeletionJob(job.supabaseAuthId);
      succeeded += 1;
      console.log(`[deletion-jobs] Deleted auth user ${job.supabaseAuthId}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await bumpAccountDeletionJobAttempt(job.supabaseAuthId, message);
      const nextAttempt = job.attempts + 1;
      const level = nextAttempt >= ALERT_AFTER_ATTEMPTS ? "ALERT" : "warn";
      // TODO(alert): wire ALERT-level lines to Sentry / paging.
      console.error(
        `[deletion-jobs] [${level}] auth user ${job.supabaseAuthId} failed (attempt ${nextAttempt}): ${message}`,
      );
    }
  }

  console.log(`[deletion-jobs] Done. ${succeeded} deleted, ${failed} still pending.`);
}

await main();
process.exit(0);
