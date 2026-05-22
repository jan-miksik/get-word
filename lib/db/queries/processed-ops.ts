import { db } from "../client";
import { processedClientOps } from "../schema";

/**
 * Records client op ids that the server has just applied so future retries
 * of the same batch are detectable. Uses ON CONFLICT DO NOTHING so re-records
 * are silently dropped; the unique constraint on (userId, clientOpId) is the
 * source of truth for "this op was applied".
 *
 * Retention invariant: rows in processed_client_ops MUST outlive any client
 * outbox op. See lib/db/schema.ts:processedClientOps and
 * scripts/compact-review-events.ts (>= 365 days) before shortening.
 */
export async function recordProcessedClientOps(args: {
  userId: string;
  deviceId?: string | null;
  clientOpIds: string[];
  entity?: string;
}): Promise<void> {
  const { userId, deviceId, clientOpIds, entity } = args;
  if (clientOpIds.length === 0) return;
  const values = clientOpIds
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => ({
      userId,
      deviceId: deviceId?.trim() || null,
      clientOpId: id,
      entity: entity ?? "batch",
    }));
  if (values.length === 0) return;
  await db.insert(processedClientOps).values(values).onConflictDoNothing();
}
