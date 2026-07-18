import {
  db,
  getUserById,
  deleteUser,
  deleteList,
  setListOwnerNullAndScrub,
  getOwnedListsWithSubscriberCounts,
  createPendingAccountDeletionJob,
  deleteAccountDeletionJob,
  bumpAccountDeletionJobAttempt,
} from '@/lib/db'
import { deleteSupabaseAuthUser } from '../supabase/admin'

type DeleteAccountStatus = 'deleted' | 'completing'
export interface DeleteAccountResult {
  status: DeleteAccountStatus
}

/**
 * Erase a user's account (GDPR right to erasure) while preserving public lists
 * that other learners depend on.
 *
 * Saga shape:
 *  1. Capture `supabaseAuthId` before any deletion.
 *  2. In one DB transaction: lock the user's owned lists, partition them into a
 *     keep-set (has other subscribers, or editor-curated) and a delete-set, and
 *     for each — anonymize (owner_id NULL + description scrubbed) or delete.
 *     If the user has a Supabase identity, record a *pending* deletion job in
 *     the same transaction so the external auth deletion is durable even if the
 *     process crashes right after commit. Finally delete the user row (cascades
 *     all personal-data tables). Lists are processed *before* the user delete so
 *     the FK `ON DELETE SET NULL` can't silently orphan delete-set lists.
 *  3. After commit, delete the Supabase `auth.users` row. On success, clear the
 *     job and report "deleted". On failure, leave the job pending for the retry
 *     processor and report "completing" (never claim full deletion yet).
 *
 * Idempotent: a missing user is treated as already deleted.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await getUserById(userId)
  if (!user) return { status: 'deleted' }
  const supabaseAuthId = user.supabaseAuthId

  await db.transaction(async (tx) => {
    const ownedLists = await getOwnedListsWithSubscriberCounts(userId, tx, {
      lock: true,
    })
    for (const list of ownedLists) {
      const keep =
        list.subscriberCount > 0 || list.isRecommended || list.isCommon
      if (keep) {
        await setListOwnerNullAndScrub(list.listId, tx)
      } else {
        await deleteList(list.listId, tx)
      }
    }

    // Durable record (committed atomically with the erasure) so the external
    // Supabase deletion is never silently lost — even on a crash after commit.
    if (supabaseAuthId) {
      await createPendingAccountDeletionJob(supabaseAuthId, tx)
    }

    await deleteUser(userId, tx)
  })

  // Device-only user with no Supabase identity: nothing external to delete.
  if (!supabaseAuthId) return { status: 'deleted' }

  try {
    await deleteSupabaseAuthUser(supabaseAuthId)
    await deleteAccountDeletionJob(supabaseAuthId)
    return { status: 'deleted' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Error-level log so this surfaces in server logs / Sentry rather than
    // being a silent failure. The pending job remains for the retry processor.
    // TODO(alert): emit an explicit Sentry/alerting event here.
    console.error(
      '[delete-account] Supabase auth deletion failed; job left pending for retry',
      { supabaseAuthId, message },
    )
    await bumpAccountDeletionJobAttempt(supabaseAuthId, message).catch((bumpError) => {
      console.error(
        '[delete-account] Failed to record deletion-job failure',
        bumpError,
      )
    })
    return { status: 'completing' }
  }
}
