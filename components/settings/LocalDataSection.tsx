'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import {
  cacheActiveListAudio,
  clearLearningCache,
  getAudioCachePreference,
  getAudioCacheStatus,
  setAudioCachePreference,
  type AudioCacheStatus,
} from '@/lib/local-learning-cache';
import { subscribeSyncStatus, type SyncStatus } from '@/lib/sync-coordinator';
import {
  discardBlockedOps,
  retryBlockedOps,
  subscribeOutboxStatus,
  type OutboxStatus,
} from '@/lib/local-first/outbox';
import { Section, ToggleSwitch } from './primitives';
import { formatByteSize, formatSyncTime } from './format';

const INITIAL_SYNC_STATUS: SyncStatus = {
  pendingCount: 0,
  isSyncing: false,
  isRetrying: false,
  lastSyncedAt: null,
  lastAttemptAt: null,
  lastError: null,
  retryCount: 0,
  nextRetryAt: null,
  lastReason: null,
};

const INITIAL_OUTBOX_STATUS: OutboxStatus = {
  total: 0,
  ready: 0,
  inBackoff: 0,
  blocked: 0,
  authRequired: 0,
  conflicts: 0,
};

export function LocalDataSection({ isOpen }: { isOpen: boolean }) {
  const { t, language } = useI18n();
  const { syncedWords } = useAppStateContext();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(INITIAL_SYNC_STATUS);
  const [outboxStatus, setOutboxStatus] = useState<OutboxStatus>(INITIAL_OUTBOX_STATUS);
  const [audioCacheEnabled, setAudioCacheEnabled] = useState(false);
  const [audioCacheStatus, setAudioCacheStatus] = useState<AudioCacheStatus | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);
  useEffect(() => subscribeOutboxStatus(setOutboxStatus), []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getAudioCacheStatus().then((status) => {
      if (!cancelled) {
        setAudioCacheStatus(status);
        setAudioCacheEnabled(getAudioCachePreference());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleAudioCacheToggle = useCallback(async (enabled: boolean) => {
    setAudioCachePreference(enabled);
    setAudioCacheEnabled(enabled);
    setCacheMessage(null);
    if (!enabled) {
      const status = await getAudioCacheStatus();
      setAudioCacheStatus(status);
      return;
    }

    setCacheBusy(true);
    try {
      const status = await cacheActiveListAudio(syncedWords ?? []);
      setAudioCacheStatus(status);
    } finally {
      setCacheBusy(false);
    }
  }, [syncedWords]);

  const handleClearLocalCache = useCallback(async () => {
    setCacheBusy(true);
    try {
      await clearLearningCache();
      setAudioCacheStatus(await getAudioCacheStatus());
      setCacheMessage(t('settings.clearLocalCacheDone'));
    } finally {
      setCacheBusy(false);
    }
  }, [t]);

  const formattedSyncTime = formatSyncTime(syncStatus.lastSyncedAt, t);
  const pendingCount = Math.max(syncStatus.pendingCount, outboxStatus.total);
  const manuallyRetryableBlocked = Math.max(
    0,
    outboxStatus.blocked - outboxStatus.conflicts - outboxStatus.authRequired,
  );
  const syncLabel = outboxStatus.blocked > 0
    ? t('settings.syncBlocked', { count: outboxStatus.blocked })
    : pendingCount > 0
    ? t('settings.syncPending', { count: pendingCount })
    : syncStatus.isRetrying
      ? t('settings.syncRetrying')
      : formattedSyncTime
        ? t('settings.syncSynced', { time: formattedSyncTime })
        : t('settings.syncNever');

  return (
    <Section label={t('settings.localData')}>
      <p className="m-0 text-xs leading-relaxed text-text-soft">
        {t('settings.localDataNotice')}
      </p>
      <div className="rounded-lg border border-border-subtle bg-background px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text">{t('settings.audioCacheEnable')}</span>
          <ToggleSwitch
            checked={audioCacheEnabled}
            onChange={(enabled) => void handleAudioCacheToggle(enabled)}
            ariaLabel={t('settings.audioCacheEnable')}
          />
        </div>
        <p className="mt-2 mb-0 text-xs leading-relaxed text-text-soft">
          {t('settings.audioCacheNotice')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-soft">
        <span>{syncLabel}</span>
        {audioCacheStatus && audioCacheStatus.cachedCount > 0 && (
          <span>
            {t('settings.audioCached', {
              count: audioCacheStatus.cachedCount,
              size: formatByteSize(audioCacheStatus.cachedSizeBytes, language),
            })}
          </span>
        )}
        {cacheMessage && <span className="text-accent">{cacheMessage}</span>}
      </div>
      {outboxStatus.blocked > 0 && (
        <div className="flex flex-wrap gap-2">
          {outboxStatus.conflicts > 0 && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('get-word:rebase-sync-conflicts'))}
              className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs font-semibold text-text-soft"
            >
              {t('settings.rebaseBlockedSync')}
            </button>
          )}
          {manuallyRetryableBlocked > 0 && (
            <button
              type="button"
              onClick={() => void retryBlockedOps()}
              className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs font-semibold text-text-soft"
            >
              {t('settings.retryBlockedSync')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void discardBlockedOps()}
            className="rounded-lg border border-danger/40 bg-background px-3 py-2 text-xs font-semibold text-danger"
          >
            {t('settings.discardBlockedSync')}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => void handleClearLocalCache()}
        disabled={cacheBusy}
        className="self-start rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs font-semibold text-text-soft transition-colors hover:border-danger/50 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cacheBusy ? t('common.saving') : t('settings.clearLocalCache')}
      </button>
    </Section>
  );
}
