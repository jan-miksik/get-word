import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env'

/**
 * Server-only Supabase admin client backed by the `service_role` secret key.
 * Used for privileged Auth operations that the publishable-key clients cannot
 * perform — currently only deleting a user's `auth.users` row during account
 * deletion. No cookies / no session persistence: this is a bare service client,
 * never tied to a browser session. NEVER import this from client code.
 */
function createSupabaseAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Delete a Supabase Auth user by id. Throws on failure so callers (the deletion
 * saga and the retry processor) can decide whether to keep the durable retry
 * job pending.
 */
export async function deleteSupabaseAuthUser(supabaseAuthId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.auth.admin.deleteUser(supabaseAuthId)
  if (error) {
    throw new Error(`Supabase admin.deleteUser failed: ${error.message}`)
  }
}
