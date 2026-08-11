import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import { syncAppliedOperations } from '../schema';
import type { Executor } from './executor';

export async function getAppliedSyncClientOpIds(
  userId: string,
  clientOpIds: string[],
  executor: Executor = db,
): Promise<Set<string>> {
  const ids = [...new Set(clientOpIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await executor
    .select({ clientOpId: syncAppliedOperations.clientOpId })
    .from(syncAppliedOperations)
    .where(and(
      eq(syncAppliedOperations.userId, userId),
      inArray(syncAppliedOperations.clientOpId, ids),
    ));
  return new Set(rows.map((row) => row.clientOpId));
}

export async function recordAppliedSyncClientOpIds(
  userId: string,
  clientOpIds: string[],
  executor: Executor = db,
): Promise<void> {
  const ids = [...new Set(clientOpIds.filter(Boolean))];
  if (ids.length === 0) return;
  await executor
    .insert(syncAppliedOperations)
    .values(ids.map((clientOpId) => ({ userId, clientOpId })))
    .onConflictDoNothing();
}
