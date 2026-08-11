'use client';

import { getDeviceId } from '@/lib/device-id';
import { debouncedSync } from '@/lib/sync';
import type { SyncMutationPayload } from '@/features/sync/types';
import { appendOp, type OutboxOp, type OutboxOperation } from './outbox';
import { ensureLocalFirstAvailability, isLocalFirstAvailableSync } from './availability';
import { scheduleDrain } from './drainer';

type EnqueueInput = OutboxOperation & {
  /** Legacy fallback payload used when local-first is unavailable. */
  legacyPayload?: SyncMutationPayload;
};

/**
 * Persist a mutation as an outbox op (durable) and schedule a drain.
 * If IndexedDB is unavailable, falls back to the existing in-memory
 * `debouncedSync` path so the app keeps working.
 */
export async function enqueueOp(input: EnqueueInput): Promise<OutboxOp | null> {
  const available = isLocalFirstAvailableSync()
    ? true
    : await ensureLocalFirstAvailability();
  if (!available) {
    if (input.legacyPayload) {
      void debouncedSync(input.legacyPayload).catch((e) =>
        console.error('[enqueueOp] legacy sync failed:', e)
      );
    }
    return null;
  }

  const op = await appendOp({
    ...input,
    deviceId: safeDeviceId(),
  });

  if (!op) {
    // Persisting failed unexpectedly — fall back to legacy sync to avoid loss.
    if (input.legacyPayload) {
      void debouncedSync(input.legacyPayload).catch((e) =>
        console.error('[enqueueOp] legacy sync after persist failure:', e)
      );
    }
    return null;
  }

  scheduleDrain();
  return op;
}

function safeDeviceId(): string | null {
  try {
    const id = getDeviceId();
    return id || null;
  } catch {
    return null;
  }
}
