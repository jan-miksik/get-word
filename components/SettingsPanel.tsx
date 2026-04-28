'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { MinigameFrequencyRange } from '@/lib/minigames';
import { MINIGAME_FREQUENCY_MIN, MINIGAME_FREQUENCY_MAX } from '@/lib/minigames';
import { MEMORY_HOOK_DISABLE_STAGE_OPTIONS, STAGES } from '@/lib/words';
import { useAppStateContext } from '@/context/AppStateContext';
import { PWAInstallSection } from '@/components/PWAInstallSection';

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
}: {
  address: string;
  copied: boolean;
  onCopy: (address: string) => void | Promise<void>;
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
        aria-label="Copy wallet address"
      >
        {copied ? 'Copied' : 'Copy'}
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
  const {
    role,
    setRole,
    memoryHooksEnabled,
    setMemoryHooksEnabled,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    userId,
    userWalletAddress,
    userEmail,
  } = useAppStateContext();

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

  const displayAddress = authAddress || userWalletAddress;

  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Settings"
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div className="panel-backdrop" onClick={onClose} aria-hidden />
      )}
      <div className="panel-content">
        <div className="p-5 sm:p-6 flex flex-col gap-4">

          {/* Header */}
          <div className="relative flex items-center min-h-8">
            <h2 className="m-0 text-base font-semibold text-text">Settings</h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-transparent border-none text-xl text-text-soft cursor-pointer leading-none transition-all hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                aria-label="Close settings"
              >
                ×
              </button>
            )}
          </div>

          {/* Memory Hooks */}
          <Section label="Memory Hooks">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-text">Enable memory hooks</span>
              <ToggleSwitch
                checked={memoryHooksEnabled}
                onChange={setMemoryHooksEnabled}
                ariaLabel="Enable memory hooks"
              />
            </div>
            {memoryHooksEnabled && (
              <label className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-sm text-text">Hide after interval</span>
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

          {/* Language */}
          <Section label="I want to learn">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole('cz')}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 bg-transparent cursor-pointer transition-all duration-150 ${
                  role === 'cz'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border-subtle text-text-soft hover:border-accent/50 hover:text-text'
                }`}
              >
                🇻🇳 Vietnamese
              </button>
              <button
                type="button"
                onClick={() => setRole('vi')}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 bg-transparent cursor-pointer transition-all duration-150 ${
                  role === 'vi'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border-subtle text-text-soft hover:border-accent/50 hover:text-text'
                }`}
              >
                🇨🇿 Czech
              </button>
            </div>
          </Section>

          {/* Mini-games */}
          <Section
            label="Mini-games"
            action={
              <ToggleSwitch
                checked={minigameFrequency !== 'off'}
                onChange={(on) => onMinigameFrequencyChange(on ? { min: 1, max: 3 } : 'off')}
                ariaLabel="Show mini-games in stream"
              />
            }
          >
            {minigameFrequency !== 'off' && (
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="m-0 text-xs text-text-soft">Cards between games</p>
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
            <Section label="App">
              <PWAInstallSection />
            </Section>
          )}

          {/* Account */}
          <div className="border-t border-border-subtle pt-4 flex flex-col gap-2">
            <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
              Account
            </p>
            {isAuthenticated ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-done shrink-0" />
                  {authEmail ? (
                    <code className="text-xs text-text-soft truncate font-mono">{authEmail}</code>
                  ) : displayAddress ? (
                    <span className="text-xs text-text-soft">Wallet connected</span>
                  ) : (
                    <span className="text-xs text-text-soft">Connected</span>
                  )}
                </div>
                {displayAddress && (
                  <AddressWithCopy
                    address={displayAddress}
                    copied={copiedAddress === displayAddress}
                    onCopy={handleCopyAddress}
                  />
                )}
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="self-start text-xs text-text-soft/70 underline cursor-pointer bg-transparent border-none p-0 text-left hover:text-text"
                  >
                    Sign out
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-soft">Not signed in</span>
                {userEmail && (
                  <code className="text-xs text-text-soft/60 font-mono break-all">{userEmail}</code>
                )}
                {userWalletAddress && (
                  <AddressWithCopy
                    address={userWalletAddress}
                    copied={copiedAddress === userWalletAddress}
                    onCopy={handleCopyAddress}
                  />
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
