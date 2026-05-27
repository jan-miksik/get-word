'use client';

type NetworkInformationLike = {
  effectiveType?: string;
  saveData?: boolean;
  type?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
};

function getConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as NavigatorWithConnection).connection ?? null;
}

function isProbablyMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const coarsePointer =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches ?? false);
  return mobileUserAgent || coarsePointer;
}

export function isAudioNetworkOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isAudioNetworkConstrained(): boolean {
  if (isAudioNetworkOffline()) return true;

  const connection = getConnection();
  if (!connection) return isProbablyMobileBrowser();
  if (connection.saveData || connection.type === 'cellular') return true;
  return ['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '');
}

/**
 * Foreground warmup is intentionally small on constrained connections, but
 * still allowed so the current learning interaction remains responsive.
 */
export function getAudioWarmupLookahead(defaultLookahead: number): number {
  if (isAudioNetworkOffline()) return -1;
  if (isAudioNetworkConstrained()) return Math.min(defaultLookahead, 1);
  return defaultLookahead;
}

export function getAudioPrefetchLimit(defaultLimit: number): number {
  if (isAudioNetworkOffline()) return 0;
  if (isAudioNetworkConstrained()) return Math.min(defaultLimit, 4);
  return defaultLimit;
}

/**
 * Whole-list downloads are optional background work. Only perform them on a
 * clearly unmetered connection; unknown mobile/PWA connections are treated as
 * constrained so installing the app does not spend cellular data silently.
 */
export function canBulkCacheAudio(): boolean {
  if (isAudioNetworkOffline()) return false;

  const connection = getConnection();
  if (!connection) return !isProbablyMobileBrowser();
  if (connection.saveData || connection.type === 'cellular') return false;
  if (connection.type === 'wifi' || connection.type === 'ethernet') return true;
  return !isProbablyMobileBrowser();
}

export function subscribeAudioNetworkChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const connection = getConnection();
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  connection?.addEventListener?.('change', listener);

  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
    connection?.removeEventListener?.('change', listener);
  };
}
