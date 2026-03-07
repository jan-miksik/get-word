'use client';

import { useCallback } from 'react';
import type { Theme } from '@/hooks/useAppState';
import type { MinigameFrequencyRange } from '@/lib/minigames';
import { MINIGAME_FREQUENCY_MIN, MINIGAME_FREQUENCY_MAX } from '@/lib/minigames';

function MinigameFrequencySlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const clamp = useCallback(
    (v: number) => Math.max(MINIGAME_FREQUENCY_MIN, Math.min(MINIGAME_FREQUENCY_MAX, v)),
    []
  );
  return (
    <div className="minigame-frequency-slider relative flex items-center gap-2">
      <div className="flex-1 relative h-6 flex items-center">
        <input
          type="range"
          min={MINIGAME_FREQUENCY_MIN}
          max={MINIGAME_FREQUENCY_MAX}
          value={min}
          onChange={(e) => {
            const nextMin = clamp(parseInt(e.target.value, 10));
            onChange(nextMin, Math.max(nextMin, max));
          }}
          className="absolute w-full h-2 appearance-none bg-border-subtle rounded-full accent-accent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-grab"
          aria-label="Minimum cards between games"
        />
        <input
          type="range"
          min={MINIGAME_FREQUENCY_MIN}
          max={MINIGAME_FREQUENCY_MAX}
          value={max}
          onChange={(e) => {
            const nextMax = clamp(parseInt(e.target.value, 10));
            onChange(Math.min(nextMax, min), nextMax);
          }}
          className="absolute w-full h-2 appearance-none bg-transparent rounded-full accent-accent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-grab z-10"
          aria-label="Maximum cards between games"
        />
      </div>
      <span className="tabular-nums text-text text-[0.75rem] w-8 shrink-0">
        {min}–{max}
      </span>
    </div>
  );
}

interface SettingsPanelProps {
  role: 'cz' | 'vi';
  onRoleChange: (role: 'cz' | 'vi') => void;
  showEnglish: boolean;
  onShowEnglishChange: (show: boolean) => void;
  showCategoryBadges: boolean;
  onShowCategoryBadgesChange: (show: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
  viewMode: 'card' | 'stream';
  onViewModeChange: (mode: 'card' | 'stream') => void;
  isOpen: boolean;
  onClose?: () => void;
  userId?: string | null;
  userWalletAddress?: string | null;
  userEmail?: string | null;
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void;
}

export function SettingsPanel({
  role,
  onRoleChange,
  showEnglish,
  onShowEnglishChange,
  showCategoryBadges,
  onShowCategoryBadgesChange,
  theme,
  onThemeChange,
  minigameFrequency,
  onMinigameFrequencyChange,
  viewMode,
  onViewModeChange,
  isOpen,
  onClose,
  userId,
  userWalletAddress,
  userEmail,
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
}: SettingsPanelProps) {
  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Settings"
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div
          className="panel-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div className="panel-content">
      <div className="flex flex-col gap-1 text-[0.8rem]">
        <div className="relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-0 right-0 bg-transparent border-none text-xl text-text-soft cursor-pointer p-1 leading-none flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-background-elevated hover:text-text"
              aria-label="Close settings"
            >
              ×
            </button>
          )}
          <p className="m-0 mb-1 text-[0.78rem] text-text-soft">Who are you?</p>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            className="accent-accent"
            name="learner-role"
            value="cz"
            checked={role === 'cz'}
            onChange={() => onRoleChange('cz')}
          />
          <span>I am Czech</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            className="accent-accent"
            name="learner-role"
            value="vi"
            checked={role === 'vi'}
            onChange={() => onRoleChange('vi')}
          />
          <span>I am Vietnamese</span>
        </label>

        {/* Theme Section */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="m-0 mb-1 text-[0.78rem] text-text-soft mb-3">Theme</p>
          <div className="flex gap-2">
            <button
              onClick={() => onThemeChange('default')}
              className={`theme-option ${theme === 'default' ? 'is-selected' : ''}`}
              aria-label="Default dark theme"
            >
              <span className="theme-preview theme-preview-default" />
              <span className={`text-[0.7rem] font-medium ${theme === 'default' ? 'text-accent' : 'text-text-soft'}`}>Dark</span>
            </button>
            <button
              onClick={() => onThemeChange('warm')}
              className={`theme-option ${theme === 'warm' ? 'is-selected' : ''}`}
              aria-label="Warm light theme"
            >
              <span className="theme-preview theme-preview-warm" />
              <span className={`text-[0.7rem] font-medium ${theme === 'warm' ? 'text-accent' : 'text-text-soft'}`}>Warm</span>
            </button>
            <button
              onClick={() => onThemeChange('calm')}
              className={`theme-option ${theme === 'calm' ? 'is-selected' : ''}`}
              aria-label="Calm blue theme"
            >
              <span className="theme-preview theme-preview-calm" />
              <span className={`text-[0.7rem] font-medium ${theme === 'calm' ? 'text-accent' : 'text-text-soft'}`}>Calm</span>
            </button>
          </div>
        </div>

        {/* Display Options Section */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="m-0 mb-1 text-[0.78rem] text-text-soft mb-3">Display Options</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showEnglish}
              onChange={(e) => onShowEnglishChange(e.target.checked)}
            />
            <span>Show English</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showCategoryBadges}
              onChange={(e) => onShowCategoryBadgesChange(e.target.checked)}
            />
            <span>Show Category Badges</span>
          </label>
        </div>

        {/* Minigames Section */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="m-0 mb-1 text-[0.78rem] text-text-soft mb-3">Mini-games</p>
          <div className="flex flex-col gap-3 text-xs text-text-soft">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={minigameFrequency !== 'off'}
                onChange={(e) =>
                  onMinigameFrequencyChange(e.target.checked ? { min: 1, max: 3 } : 'off')
                }
                className="accent-accent rounded"
              />
              <span>Show mini-games in the stream</span>
            </label>
            {minigameFrequency !== 'off' && (
              <div className="pl-0 flex flex-col gap-2">
                <MinigameFrequencySlider
                  min={minigameFrequency.min}
                  max={minigameFrequency.max}
                  onChange={(min, max) => onMinigameFrequencyChange({ min, max })}
                />
                <p className="m-0 text-[0.7rem] text-text-soft">
                  {minigameFrequency.min} – {minigameFrequency.max} word cards between games
                </p>
              </div>
            )}
          </div>
        </div>

        {/* View Mode */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <div className="flex items-center justify-between py-2">
            <span className="text-[0.78rem] text-text-soft">View mode</span>
            <div className="flex items-center gap-2">
              <span className="text-[0.78rem] text-text-soft">
                {viewMode === 'card' ? 'Card' : 'Stream'}
              </span>
              <button
                role="switch"
                aria-checked={viewMode === 'stream'}
                aria-label="view mode"
                onClick={() => onViewModeChange(viewMode === 'card' ? 'stream' : 'card')}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  viewMode === 'stream' ? 'bg-accent' : 'bg-border-subtle'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    viewMode === 'stream' ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Account Section */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="m-0 text-[0.78rem] text-text-soft mb-2">Account</p>
          {isAuthenticated ? (
            <div className="flex flex-col gap-2">
              {authEmail && (
                <code className="block text-xs text-text-soft break-all font-mono">
                  {authEmail}
                </code>
              )}
              {(authAddress || userWalletAddress) && (
                <code className="block text-xs text-text-soft break-all font-mono">
                  {authAddress || userWalletAddress}
                </code>
              )}
              {!authEmail && !authAddress && !userWalletAddress && (
                <code className="block text-xs text-text-soft break-all font-mono">
                  Connected
                </code>
              )}
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-xs text-text-soft underline cursor-pointer bg-transparent border-none p-0 text-left hover:text-text"
                >
                  Sign out
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-soft">Not signed in</p>
              {(userEmail || userWalletAddress) && (
                <>
                  {userEmail && (
                    <code className="block text-xs text-text-soft break-all font-mono">
                      {userEmail}
                    </code>
                  )}
                  {userWalletAddress && (
                    <code className="block text-xs text-text-soft break-all font-mono">
                      {userWalletAddress}
                    </code>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* User ID */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="m-0 mb-1 text-[0.78rem] text-text-soft mb-2">User ID</p>
          <code className="block text-xs text-text-soft break-all font-mono">
            {userId || '—'}
          </code>
        </div>
      </div>
      </div>
    </section>
  );
}
