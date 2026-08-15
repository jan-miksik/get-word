'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useStandaloneStatus } from '@/hooks/usePWAInstallState';
import { isAndroid } from '@/lib/pwa-install';
import {
  getStoreListingUrl,
  resolveStoreTarget,
  type StoreTarget,
} from '@/lib/store-listing';
import { usePlatformCapabilities } from '@/packages/product/shared/platform/capabilities';

export interface StoreListing {
  target: StoreTarget | null;
  url: string | null;
}

const NO_STORE_LISTING: StoreListing = { target: null, url: null };

const noopSubscribe = () => () => {};
const serverFalse = () => false;

/**
 * The store listing this device can open, or nulls when there is none — a
 * browser tab has nothing to rate.
 *
 * The platform reads go through `useSyncExternalStore` so the server snapshot
 * is a plain `false`: the listing resolves after hydration instead of
 * mismatching against HTML rendered without a `window`.
 */
export function useStoreListing(): StoreListing {
  const { runtime } = usePlatformCapabilities();
  const isInstalled = useStandaloneStatus();
  // UA-derived and constant for the session, hence the no-op subscribe.
  const isAndroidDevice = useSyncExternalStore(noopSubscribe, isAndroid, serverFalse);

  return useMemo(() => {
    const target = resolveStoreTarget({
      runtime,
      isAndroid: isAndroidDevice,
      isInstalled,
    });
    if (!target) return NO_STORE_LISTING;
    return { target, url: getStoreListingUrl(target) };
  }, [isAndroidDevice, isInstalled, runtime]);
}
