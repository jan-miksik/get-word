import {
  getUserBySupabaseAuthId,
  getUserByEmail,
  getUserByDeviceId,
  createUser,
  updateUserFields,
  type User,
} from '@/lib/db'

export interface SupabaseIdentity {
  /** Supabase Auth user id (uuid). The stable primary key for the identity. */
  supabaseAuthId: string
  /** Verified email from Supabase, if present. */
  email?: string | null
  /** Provider string, e.g. "google" | "email". */
  authProvider?: string | null
  /** Device id from the client (localStorage), used only for first-login claim. */
  deviceId?: string | null
}

function normalize(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Resolve the app `users` row for a verified Supabase identity and attach
 * `supabase_auth_id` to it. Resolution priority:
 *   1. existing supabase_auth_id  (returning user)
 *   2. email                      (e.g. the pre-existing editor account)
 *   3. deviceId                   (first-login claim of device progress)
 *   4. create a new user
 *
 * This NEVER deletes or merges user rows, so owned word lists can't be
 * orphaned. For the device-claim case it attaches identity to the *same* row
 * that already holds the device's progress — a single UPDATE, no migration.
 */
export async function resolveAndAttachSupabaseUser(
  identity: SupabaseIdentity
): Promise<User> {
  const supabaseAuthId = normalize(identity.supabaseAuthId)
  if (!supabaseAuthId) {
    throw new Error('resolveAndAttachSupabaseUser: supabaseAuthId is required')
  }
  const email = normalize(identity.email)
  const authProvider = normalize(identity.authProvider)
  const deviceId = normalize(identity.deviceId)

  const bySupabase = await getUserBySupabaseAuthId(supabaseAuthId)
  if (bySupabase) {
    // Returning user: refresh email/provider if they changed, keep role/lists.
    return applyIdentityFields(bySupabase, { supabaseAuthId, email, authProvider })
  }

  // Resolve a row to attach this Supabase identity to.
  const target =
    (email ? await getUserByEmail(email) : null) ??
    (deviceId ? await getUserByDeviceId(deviceId) : null)

  if (target) {
    return applyIdentityFields(target, { supabaseAuthId, email, authProvider })
  }

  return createUser({
    supabaseAuthId,
    registeredAt: new Date(),
    ...(email && { email }),
    ...(authProvider && { authProvider }),
    ...(deviceId && { deviceId }),
  })
}

/**
 * Set supabase_auth_id (and email/provider when missing) on a user, avoiding
 * unique-constraint conflicts on email (don't overwrite a different existing
 * email). Returns the updated row, or the original if nothing changed.
 */
async function applyIdentityFields(
  user: User,
  fields: { supabaseAuthId: string; email: string | null; authProvider: string | null }
): Promise<User> {
  const patch: Partial<User> = {}
  if (user.supabaseAuthId !== fields.supabaseAuthId) {
    patch.supabaseAuthId = fields.supabaseAuthId
    // First attachment of a verified identity to this row = registration moment.
    if (user.supabaseAuthId === null) {
      patch.registeredAt = user.registeredAt ?? new Date()
    }
  }
  // Only set email if the row has none, to avoid clobbering / unique conflicts.
  if (fields.email && !user.email) {
    patch.email = fields.email
  }
  if (fields.authProvider && user.authProvider !== fields.authProvider) {
    patch.authProvider = fields.authProvider
  }
  if (Object.keys(patch).length === 0) return user
  const updated = await updateUserFields(user.id, patch)
  return updated ?? user
}
