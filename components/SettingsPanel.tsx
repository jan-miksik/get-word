'use client';

import { useCallback, type ReactNode } from 'react';
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

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-background-elevated/50 p-4 flex flex-col gap-3">
      <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
        {label}
      </p>
      {children}
    </div>
  );
}

const sliderClass = [
  'w-full appearance-none cursor-pointer outline-none bg-transparent',
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/20',
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:shadow',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/20',
  '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer',
  'focus-visible:outline-none',
].join(' ');

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
  viewMode,
  onViewModeChange,
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
    showEnglish,
    setShowEnglish,
    showCategoryBadges,
    setShowCategoryBadges,
    showPronunciation,
    setShowPronunciation,
    memoryHooksEnabled,
    setMemoryHooksEnabled,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    theme,
    setTheme,
    userId,
    userWalletAddress,
    userEmail,
  } = useAppStateContext();

  const minFreq = minigameFrequency !== 'off' ? minigameFrequency.min : 1;
  const maxFreq = minigameFrequency !== 'off' ? minigameFrequency.max : 3;

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

          {/* Display */}
          <Section label="Display">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-text">Show English</span>
              <ToggleSwitch
                checked={showEnglish}
                onChange={setShowEnglish}
                ariaLabel="Show English"
              />
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-text">Category badges</span>
              <ToggleSwitch
                checked={showCategoryBadges}
                onChange={setShowCategoryBadges}
                ariaLabel="Show category badges"
              />
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-text">Show pronunciation</span>
              <ToggleSwitch
                checked={showPronunciation}
                onChange={setShowPronunciation}
                ariaLabel="Show pronunciation"
              />
            </div>
          </Section>

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
          <Section label="Mini-games">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Show in stream</span>
              <ToggleSwitch
                checked={minigameFrequency !== 'off'}
                onChange={(on) => onMinigameFrequencyChange(on ? { min: 1, max: 3 } : 'off')}
                ariaLabel="Enable mini-games"
              />
            </div>
            {minigameFrequency !== 'off' && (
              <div className="flex flex-col gap-3 pt-1">
                <p className="m-0 text-xs text-text-soft">Cards between games</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-soft w-6 shrink-0">Min</span>
                    <input
                      type="range"
                      min={MINIGAME_FREQUENCY_MIN}
                      max={MINIGAME_FREQUENCY_MAX}
                      value={minFreq}
                      onChange={(e) => handleMinChange(Number(e.target.value))}
                      className={sliderClass}
                      aria-label="Minimum cards between games"
                    />
                    <span className="w-5 text-center text-sm font-medium tabular-nums text-text shrink-0">
                      {minFreq}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-soft w-6 shrink-0">Max</span>
                    <input
                      type="range"
                      min={MINIGAME_FREQUENCY_MIN}
                      max={MINIGAME_FREQUENCY_MAX}
                      value={maxFreq}
                      onChange={(e) => handleMaxChange(Number(e.target.value))}
                      className={sliderClass}
                      aria-label="Maximum cards between games"
                    />
                    <span className="w-5 text-center text-sm font-medium tabular-nums text-text shrink-0">
                      {maxFreq}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* View Mode */}
          <Section label="View">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">View mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={viewMode === 'stream'}
                aria-label="view mode"
                onClick={() => onViewModeChange(viewMode === 'card' ? 'stream' : 'card')}
                className="flex items-center rounded-xl bg-background border border-border-subtle p-1 gap-0.5 cursor-pointer"
              >
                <span
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 ${
                    viewMode === 'card' ? 'bg-accent text-white shadow-sm' : 'text-text-soft'
                  }`}
                >
                  Card
                </span>
                <span
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 ${
                    viewMode === 'stream' ? 'bg-accent text-white shadow-sm' : 'text-text-soft'
                  }`}
                >
                  Stream
                </span>
              </button>
            </div>
          </Section>

          {/* Theme */}
          <Section label="Theme">
            <div className="flex gap-2">
              {([
                { id: 'default', label: 'Dark', bg: 'linear-gradient(135deg, #060a18 60%, #0d1626)', dot: '#38bdf8' },
                { id: 'warm', label: 'Warm', bg: 'linear-gradient(135deg, #FBF8F2 60%, #F0EBE1)', dot: '#E66F2D' },
                { id: 'calm', label: 'Calm', bg: 'linear-gradient(135deg, #F0F4F8 60%, #E2EBF4)', dot: '#5B8FB9' },
              ] as const).map(({ id, label, bg, dot }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  aria-label={`${label} theme`}
                  className={`flex-1 flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 bg-transparent cursor-pointer transition-all duration-150 ${
                    theme === id ? 'border-accent' : 'border-border-subtle hover:border-accent/40'
                  }`}
                >
                  <div
                    className="w-full rounded-lg overflow-hidden flex items-end p-1.5"
                    style={{ background: bg, aspectRatio: '4/3' }}
                  >
                    <div className="h-1 rounded-full w-1/2" style={{ background: dot }} />
                  </div>
                  <span
                    className={`text-[0.7rem] font-semibold ${
                      theme === id ? 'text-accent' : 'text-text-soft'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* App */}
          <Section label="App">
            <PWAInstallSection />
          </Section>

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
                    <code className="text-xs text-text-soft font-mono">
                      {displayAddress.slice(0, 8)}…{displayAddress.slice(-6)}
                    </code>
                  ) : (
                    <span className="text-xs text-text-soft">Connected</span>
                  )}
                </div>
                {authEmail && displayAddress && (
                  <code className="text-xs text-text-soft/60 font-mono">
                    {displayAddress.slice(0, 8)}…{displayAddress.slice(-6)}
                  </code>
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
                  <code className="text-xs text-text-soft/60 font-mono">
                    {userWalletAddress.slice(0, 8)}…{userWalletAddress.slice(-6)}
                  </code>
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
