'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { MinigameFrequencyRange } from '@/lib/minigames';
import { MINIGAME_FREQUENCY_MIN, MINIGAME_FREQUENCY_MAX } from '@/lib/minigames';
import { MEMORY_HOOK_DISABLE_STAGE_OPTIONS, STAGES } from '@/lib/words';
import { useAppStateContext } from '@/context/AppStateContext';
import { PWAInstallSection } from '@/components/PWAInstallSection';
import { useI18n } from '@/components/I18nProvider';
import { SettingsLanguagePicker } from '@/components/SettingsLanguagePicker';
import {
  cacheActiveListAudio,
  clearLearningCache,
  getAudioCachePreference,
  getAudioCacheStatus,
  getStoragePreference,
  setAudioCachePreference,
  setStoragePreference,
  type AudioCacheStatus,
} from '@/lib/local-learning-cache';
import {
  flushPendingSync,
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from '@/lib/sync-coordinator';
import { persistLearningRoleForPair } from '@/features/learning/app-state/storage';

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        checked ? 'bg-accent' : 'bg-white/20'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-background-elevated/50 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function AddressWithCopy({
  address,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  address: string;
  copied: boolean;
  onCopy: (address: string) => void | Promise<void>;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg bg-background/70 px-2.5 py-2 font-mono text-[0.68rem] leading-relaxed text-text-soft">
        {address}
      </code>
      <button
        type="button"
        onClick={() => void onCopy(address)}
        className="shrink-0 rounded-lg border border-border-subtle bg-background px-2.5 py-2 text-xs font-semibold text-text-soft transition-colors hover:border-accent/50 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        aria-label={copyLabel}
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function formatSyncTime(timestamp: number | null): string | null {
  if (!timestamp) return null;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 60 * 60_000) return `${Math.max(1, Math.round(diffMs / 60_000))} min ago`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.max(1, Math.round(diffMs / (60 * 60_000)))} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatLanguageLabel(code: string): string {
  try {
    const display = new Intl.DisplayNames(undefined, { type: 'language' });
    return display.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function LearningLanguageButton({
  label,
  code,
  selected,
  onClick,
}: {
  label: string;
  code: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
        selected
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border-subtle text-text-soft hover:border-accent/50 hover:text-text'
      }`}
    >
      <span className="block truncate">{label}</span>
      <span className="mt-0.5 block text-[0.68rem] uppercase tracking-wide opacity-75">
        {code}
      </span>
    </button>
  );
}

interface SettingsPanelProps {
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
  viewMode: 'card' | 'stream';
  onViewModeChange: (mode: 'card' | 'stream') => void;
  isOpen: boolean;
  onClose?: () => void;
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void | Promise<void>;
}

export function SettingsPanel({
  minigameFrequency,
  onMinigameFrequencyChange,
  isOpen,
  onClose,
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
}: SettingsPanelProps) {
  const { t, isAutogenerated } = useI18n();
  const {
    role,
    setRole,
    memoryHooksEnabled,
    setMemoryHooksEnabled,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    settingsLanguage,
    setSettingsLanguage,
    userId,
    userWalletAddress,
    userEmail,
    syncedWords,
    subscribedLists = [],
    activeList = null,
    activeListId,
  } = useAppStateContext();

  const currentLearningList = activeList
    ?? subscribedLists.find((list) => list.id === activeListId)
    ?? null;

  const minFreq = minigameFrequency !== 'off' ? minigameFrequency.min : 1;
  const maxFreq = minigameFrequency !== 'off' ? minigameFrequency.max : 3;
  const minFreqPercent =
    ((minFreq - MINIGAME_FREQUENCY_MIN) / (MINIGAME_FREQUENCY_MAX - MINIGAME_FREQUENCY_MIN)) *
    100;
  const maxFreqPercent =
    ((maxFreq - MINIGAME_FREQUENCY_MIN) / (MINIGAME_FREQUENCY_MAX - MINIGAME_FREQUENCY_MIN)) *
    100;
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [localCacheEnabled, setLocalCacheEnabled] = useState(() => getStoragePreference());
  const [audioCacheEnabled, setAudioCacheEnabled] = useState(() => getAudioCachePreference());
  const [audioCacheStatus, setAudioCacheStatus] = useState<AudioCacheStatus | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);

  const handleMinChange = useCallback(
    (value: number) => {
      if (minigameFrequency === 'off') return;
      const next = Math.max(MINIGAME_FREQUENCY_MIN, Math.min(minigameFrequency.max, value));
      onMinigameFrequencyChange({ min: next, max: minigameFrequency.max });
    },
    [minigameFrequency, onMinigameFrequencyChange]
  );

  const handleMaxChange = useCallback(
    (value: number) => {
      if (minigameFrequency === 'off') return;
      const next = Math.max(minigameFrequency.min, Math.min(MINIGAME_FREQUENCY_MAX, value));
      onMinigameFrequencyChange({ min: minigameFrequency.min, max: next });
    },
    [minigameFrequency, onMinigameFrequencyChange]
  );

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await copyTextToClipboard(address);
      setCopiedAddress(address);
    } catch {
      // If the browser blocks clipboard access, keep the address visible for manual copy.
    }
  }, []);

  useEffect(() => {
    if (!copiedAddress) return;
    const timeout = window.setTimeout(() => setCopiedAddress(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedAddress]);

  useEffect(() => {
    const mobileQuery = window.matchMedia?.('(max-width: 767px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    syncMobileViewport();
    mobileQuery?.addEventListener('change', syncMobileViewport);
    return () => mobileQuery?.removeEventListener('change', syncMobileViewport);
  }, []);

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getAudioCacheStatus().then((status) => {
      if (!cancelled) setAudioCacheStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleLocalCacheToggle = useCallback((enabled: boolean) => {
    setStoragePreference(enabled);
    setLocalCacheEnabled(enabled);
    setCacheMessage(null);
    if (enabled) {
      void flushPendingSync('manual');
    }
  }, []);

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
      setLocalCacheEnabled(false);
      setAudioCacheEnabled(false);
      setStoragePreference(false);
      setAudioCachePreference(false);
      setAudioCacheStatus(await getAudioCacheStatus());
      setCacheMessage(t('settings.clearLocalCacheDone'));
    } finally {
      setCacheBusy(false);
    }
  }, [t]);

  const displayAddress = authAddress || userWalletAddress;
  const formattedSyncTime = formatSyncTime(syncStatus.lastSyncedAt);
  const syncLabel = syncStatus.pendingCount > 0
    ? t('settings.syncPending', { count: syncStatus.pendingCount })
    : syncStatus.isRetrying
      ? t('settings.syncRetrying')
      : formattedSyncTime
        ? t('settings.syncSynced', { time: formattedSyncTime })
        : t('settings.syncNever');

  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open' : ''}`}
      aria-label={t('common.settings')}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div className="panel-backdrop" onClick={onClose} aria-hidden />
      )}
      <div className="panel-content">
        <div className="p-5 sm:p-6 flex flex-col gap-4">

          {/* Header */}
          <div className="relative flex items-center min-h-8">
            <h2 className="m-0 text-base font-semibold text-text">{t('common.settings')}</h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-transparent border-none text-xl text-text-soft cursor-pointer leading-none transition-all hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                aria-label={t('common.close')}
              >
                ×
              </button>
            )}
          </div>

          {/* Memory Hooks */}
          <Section label={t('settings.memoryHooks')}>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-text">{t('settings.memoryHooksEnable')}</span>
              <ToggleSwitch
                checked={memoryHooksEnabled}
                onChange={setMemoryHooksEnabled}
                ariaLabel={t('settings.memoryHooksEnable')}
              />
            </div>
            {memoryHooksEnabled && (
              <label className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-sm text-text">{t('settings.hideAfterInterval')}</span>
                <select
                  value={memoryHookDisableFromStage}
                  onChange={(e) => setMemoryHookDisableFromStage(Number(e.target.value))}
                  aria-label="Hide memory hooks from interval"
                  className="rounded-lg border border-border-subtle bg-background px-2 py-1 text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  {MEMORY_HOOK_DISABLE_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGES[stage]?.name ?? `${stage}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Section>

          <Section label={t('language.sectionLabel')}>
            <SettingsLanguagePicker
              value={settingsLanguage}
              onChange={setSettingsLanguage}
              compact
            />
            {isAutogenerated && (
              <p className="m-0 text-xs leading-relaxed text-text-soft">
                {t('language.autogeneratedNotice')}
              </p>
            )}
          </Section>

          {/* Learning Language */}
          <Section label={t('settings.iWantToLearn')}>
            {currentLearningList ? (
              <div className="flex gap-2">
                <LearningLanguageButton
                  label={formatLanguageLabel(currentLearningList.languageTo)}
                  code={currentLearningList.languageTo}
                  selected={role === 'cz'}
                  onClick={() => {
                    persistLearningRoleForPair(
                      currentLearningList.languageFrom,
                      currentLearningList.languageTo,
                      'cz',
                    );
                    setRole('cz');
                  }}
                />
                <LearningLanguageButton
                  label={formatLanguageLabel(currentLearningList.languageFrom)}
                  code={currentLearningList.languageFrom}
                  selected={role === 'vi'}
                  onClick={() => {
                    persistLearningRoleForPair(
                      currentLearningList.languageFrom,
                      currentLearningList.languageTo,
                      'vi',
                    );
                    setRole('vi');
                  }}
                />
              </div>
            ) : (
              <p className="m-0 text-sm text-text-soft">Choose a list first to set the learning language.</p>
            )}
          </Section>

          {/* Mini-games */}
          <Section
            label={t('settings.minigames')}
            action={
              <ToggleSwitch
                checked={minigameFrequency !== 'off'}
                onChange={(on) => onMinigameFrequencyChange(on ? { min: 1, max: 3 } : 'off')}
                ariaLabel={t('settings.minigames')}
              />
            }
          >
            {minigameFrequency !== 'off' && (
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="m-0 text-xs text-text-soft">{t('settings.cardsBetweenGames')}</p>
                  <div className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold tabular-nums text-text">
                    {minFreq}–{maxFreq}
                  </div>
                </div>
                <div className="minigame-range-control">
                  <div className="minigame-range-track" />
                  <div
                    className="minigame-range-track-fill"
                    style={{
                      left: `${minFreqPercent}%`,
                      right: `${100 - maxFreqPercent}%`,
                    }}
                  />
                  <div
                    className="minigame-range-handle"
                    style={{ left: `${minFreqPercent}%` }}
                    aria-hidden
                  >
                    {minFreq}
                  </div>
                  <div
                    className="minigame-range-handle"
                    style={{ left: `${maxFreqPercent}%` }}
                    aria-hidden
                  >
                    {maxFreq}
                  </div>
                  <input
                    type="range"
                    min={MINIGAME_FREQUENCY_MIN}
                    max={MINIGAME_FREQUENCY_MAX}
                    value={minFreq}
                    onChange={(e) => handleMinChange(Number(e.target.value))}
                    className={`minigame-range-input ${minFreq >= maxFreq ? 'is-front' : ''}`}
                    aria-label="Minimum cards between games"
                  />
                  <input
                    type="range"
                    min={MINIGAME_FREQUENCY_MIN}
                    max={MINIGAME_FREQUENCY_MAX}
                    value={maxFreq}
                    onChange={(e) => handleMaxChange(Number(e.target.value))}
                    className="minigame-range-input is-upper"
                    aria-label="Maximum cards between games"
                  />
                </div>
                <div className="flex items-center justify-between text-[0.65rem] font-medium uppercase tracking-wide text-text-soft/60">
                  <span>{MINIGAME_FREQUENCY_MIN}</span>
                  <span>{MINIGAME_FREQUENCY_MAX}</span>
                </div>
              </div>
            )}
          </Section>

          {/* App */}
          {isMobileViewport && (
            <Section label={t('settings.app')}>
              <PWAInstallSection />
            </Section>
          )}

          <Section label={t('settings.localData')}>
            <p className="m-0 text-xs leading-relaxed text-text-soft">
              {t('settings.localDataNotice')}
            </p>
            <div className="rounded-lg border border-border-subtle bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text">{t('settings.localCacheEnable')}</span>
                <ToggleSwitch
                  checked={localCacheEnabled}
                  onChange={handleLocalCacheToggle}
                  ariaLabel={t('settings.localCacheEnable')}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-sm text-text">{t('settings.audioCacheEnable')}</span>
                <ToggleSwitch
                  checked={audioCacheEnabled}
                  onChange={(enabled) => void handleAudioCacheToggle(enabled)}
                  ariaLabel={t('settings.audioCacheEnable')}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-soft">
              <span>{syncLabel}</span>
              {audioCacheStatus && audioCacheStatus.cachedCount > 0 && (
                <span>{t('settings.audioCached', { count: audioCacheStatus.cachedCount })}</span>
              )}
              {cacheMessage && <span className="text-accent">{cacheMessage}</span>}
            </div>
            <button
              type="button"
              onClick={() => void handleClearLocalCache()}
              disabled={cacheBusy}
              className="self-start rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs font-semibold text-text-soft transition-colors hover:border-danger/50 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cacheBusy ? t('common.saving') : t('settings.clearLocalCache')}
            </button>
          </Section>

          {/* Account */}
          <div className="border-t border-border-subtle pt-4 flex flex-col gap-2">
            <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
              {t('settings.account')}
            </p>
            {isAuthenticated ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-done shrink-0" />
                  {authEmail ? (
                    <code className="text-xs text-text-soft truncate font-mono">{authEmail}</code>
                  ) : displayAddress ? (
                    <span className="text-xs text-text-soft">{t('settings.walletConnected')}</span>
                  ) : (
                    <span className="text-xs text-text-soft">{t('settings.connected')}</span>
                  )}
                </div>
                {displayAddress && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-text-soft/60">
                      Crypto wallet address
                    </span>
                    <AddressWithCopy
                      address={displayAddress}
                      copied={copiedAddress === displayAddress}
                      onCopy={handleCopyAddress}
                      copyLabel={t('common.copy')}
                      copiedLabel={t('common.copied')}
                    />
                  </div>
                )}
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="self-start text-xs text-text-soft/70 underline cursor-pointer bg-transparent border-none p-0 text-left hover:text-text"
                  >
                    {t('common.signOut')}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-soft">{t('settings.notSignedIn')}</span>
                {userEmail && (
                  <code className="text-xs text-text-soft/60 font-mono break-all">{userEmail}</code>
                )}
                {userWalletAddress && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-text-soft/60">
                      Crypto wallet address
                    </span>
                    <AddressWithCopy
                      address={userWalletAddress}
                      copied={copiedAddress === userWalletAddress}
                      onCopy={handleCopyAddress}
                      copyLabel={t('common.copy')}
                      copiedLabel={t('common.copied')}
                    />
                  </div>
                )}
              </div>
            )}
            {userId && (
              <code className="text-[0.6rem] text-text-soft/40 font-mono break-all mt-1">
                {userId}
              </code>
            )}
          </div>

          {process.env.NEXT_PUBLIC_APP_VERSION && (
            <p className="m-0 text-center text-[0.6rem] text-text-soft/30 font-mono">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </p>
          )}

        </div>
      </div>
    </section>
  );
}
