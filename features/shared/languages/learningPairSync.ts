'use client';

import { enqueueOp } from '@/lib/local-first/enqueue';
import { flushOutboxBeforeRead } from '@/lib/local-first/drainer';
import { syncUserData } from '@/lib/sync';
import {
  clearPendingLearningLanguagePair,
  storeLearningLanguagePair,
  storePendingLearningLanguagePair,
  type PendingLearningLanguagePair,
} from './learningPairStorage';

/**
 * Durably queue one atomic language-pair mutation and try to send it now.
 *
 * IndexedDB survives navigation and is retried by the app lifecycle drainer on
 * blur, pagehide, focus and reconnect. The local pending marker additionally
 * protects the optimistic pair from stale server snapshots after a remount.
 */
export async function queuePendingLearningLanguagePair(
  pair: PendingLearningLanguagePair,
): Promise<void> {
  storePendingLearningLanguagePair(pair);
  storeLearningLanguagePair({ from: pair.from, to: pair.to });
  const payload = {
    language_from: pair.from,
    language_to: pair.to,
    onboarding_completed: true,
  } as const;
  const queued = await enqueueOp({
    entity: 'preference',
    opType: 'set_language_pair',
    payload: { values: payload },
    legacyPayload: payload,
  }).catch((error) => {
    console.error('[learningPairSync] queue:', error);
    return null;
  });

  if (queued) {
    await flushOutboxBeforeRead();
    return;
  }

  // IndexedDB can be unavailable in private browsing. enqueueOp scheduled its
  // legacy debounce already; make an immediate best-effort attempt as well.
  const response = await syncUserData(payload).catch((error) => {
    console.error('[learningPairSync] direct fallback:', error);
    return null;
  });
  if (
    response?.user?.language_from === pair.from &&
    response.user.language_to === pair.to
  ) {
    clearPendingLearningLanguagePair();
  }
}
