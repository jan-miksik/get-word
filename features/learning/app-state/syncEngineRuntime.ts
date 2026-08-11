'use client';

import type { SyncResponse } from '@/features/sync/contracts';
import {
  SyncEngine,
  type ConnectivitySource,
} from '@/packages/product/shared/sync/engine';
import { fetchUserData } from '@/lib/sync';
import {
  loadAllDomainsFromIdb,
  persistDeltaToIdb,
  persistDomainsToIdb,
  type IdbHydration,
} from '@/lib/local-first/hydrate';
import { getMeta, putMeta } from '@/lib/local-first/stores';
import {
  getSnapshot,
  getStoragePreference,
} from '@/lib/local-learning-cache';

function browserConnectivity(): ConnectivitySource {
  return {
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    subscribe: (listener) => {
      if (typeof window === 'undefined') return () => undefined;
      const online = () => listener(true);
      const offline = () => listener(false);
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      return () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      };
    },
  };
}

async function loadCachedHydration(): Promise<IdbHydration | null> {
  if (!getStoragePreference()) return null;
  const domains = await loadAllDomainsFromIdb().catch(() => null);
  if (domains) return domains;
  const snapshot = await getSnapshot().catch(() => null);
  if (!snapshot) return null;
  return {
    syncResponse: { success: true, ...snapshot.data } as SyncResponse,
    activeListId: snapshot.activeListId,
  };
}

async function persistSnapshot(
  data: SyncResponse,
): Promise<boolean> {
  if (!getStoragePreference()) return true;
  if (data.is_delta) return persistDeltaToIdb(data).catch(() => false);

  const domainsSaved = await persistDomainsToIdb(data).catch(() => false);
  if (!domainsSaved) return false;

  const metaPatch: { lastSinceCursor?: string; lastContentRevision?: string } = {};
  if (typeof data.sync_revision === 'number') {
    metaPatch.lastSinceCursor = String(data.sync_revision);
  }
  if (typeof data.content_revision === 'string') {
    metaPatch.lastContentRevision = data.content_revision;
  }
  if (Object.keys(metaPatch).length === 0) return true;
  return putMeta(metaPatch).catch(() => false);
}

export function createLearningSyncEngine() {
  return new SyncEngine<IdbHydration, SyncResponse>({
    transport: {
      pull: (cursor) => fetchUserData(
        cursor ? { since: cursor.since, contentRev: cursor.contentRevision } : undefined,
      ),
    },
    repository: {
      load: loadCachedHydration,
      readCursor: async () => {
        if (!getStoragePreference()) return undefined;
        const meta = await getMeta().catch(() => null);
        if (!meta?.lastSinceCursor || !meta.lastContentRevision) return undefined;
        return {
          since: meta.lastSinceCursor,
          contentRevision: meta.lastContentRevision,
        };
      },
      persist: persistSnapshot,
    },
    clock: { now: () => Date.now() },
    connectivity: browserConnectivity(),
  });
}

export type LearningSyncEngine = ReturnType<typeof createLearningSyncEngine>;

export function subscribeLearningRefreshSignals(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') listener();
  };
  window.addEventListener('focus', listener);
  window.addEventListener('pageshow', listener);
  window.addEventListener('online', listener);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    window.removeEventListener('focus', listener);
    window.removeEventListener('pageshow', listener);
    window.removeEventListener('online', listener);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
