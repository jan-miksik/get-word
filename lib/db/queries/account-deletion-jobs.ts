import { asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import type { Executor } from "./executor";
import { accountDeletionJobs, type AccountDeletionJob } from "../schema";

/** Postgres/error text can be unbounded; never persist more than this. */
const MAX_LAST_ERROR_LEN = 1000;

/**
 * Record (idempotently) that a deleted user's Supabase auth identity still needs
 * removing. Created inside the account-deletion transaction so it commits
 * atomically with the data erasure — even a crash before the external Supabase
 * call leaves this durable record for the retry processor. `ON CONFLICT DO
 * NOTHING` keeps double-submits / retries from creating duplicates.
 */
export async function createPendingAccountDeletionJob(
  supabaseAuthId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(accountDeletionJobs)
    .values({ supabaseAuthId })
    .onConflictDoNothing({ target: accountDeletionJobs.supabaseAuthId });
}

/** Remove the job once the Supabase auth user is confirmed deleted. */
export async function deleteAccountDeletionJob(
  supabaseAuthId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .delete(accountDeletionJobs)
    .where(eq(accountDeletionJobs.supabaseAuthId, supabaseAuthId));
}

/** Atomically bump the attempt counter and store a truncated error message. */
export async function bumpAccountDeletionJobAttempt(
  supabaseAuthId: string,
  error: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(accountDeletionJobs)
    .set({
      attempts: sql`${accountDeletionJobs.attempts} + 1`,
      lastError: error.slice(0, MAX_LAST_ERROR_LEN),
      updatedAt: new Date(),
    })
    .where(eq(accountDeletionJobs.supabaseAuthId, supabaseAuthId));
}

/** List pending jobs oldest-first for the retry processor. */
export async function getPendingAccountDeletionJobs(
  limit = 100,
  executor: Executor = db,
): Promise<AccountDeletionJob[]> {
  return executor
    .select()
    .from(accountDeletionJobs)
    .orderBy(asc(accountDeletionJobs.createdAt))
    .limit(limit);
}
