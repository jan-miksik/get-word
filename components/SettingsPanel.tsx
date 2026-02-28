'use client';

import type { Theme } from '@/hooks/useAppState';

interface SettingsPanelProps {
  role: 'cz' | 'vi';
  onRoleChange: (role: 'cz' | 'vi') => void;
  showEnglish: boolean;
  onShowEnglishChange: (show: boolean) => void;
  showCategoryBadges: boolean;
  onShowCategoryBadgesChange: (show: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  minigameFrequency: 'off' | '2-5' | '3-7' | '5-10';
  onMinigameFrequencyChange: (value: 'off' | '2-5' | '3-7' | '5-10') => void;
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
              <span className="theme-label">Dark</span>
            </button>
            <button
              onClick={() => onThemeChange('warm')}
              className={`theme-option ${theme === 'warm' ? 'is-selected' : ''}`}
              aria-label="Warm light theme"
            >
              <span className="theme-preview theme-preview-warm" />
              <span className="theme-label">Warm</span>
            </button>
            <button
              onClick={() => onThemeChange('calm')}
              className={`theme-option ${theme === 'calm' ? 'is-selected' : ''}`}
              aria-label="Calm blue theme"
            >
              <span className="theme-preview theme-preview-calm" />
              <span className="theme-label">Calm</span>
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
          <div className="flex flex-col gap-2 text-xs text-text-soft">
            <span>How often should mini-games appear in the stream?</span>
            <div className="flex flex-col gap-1 mt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="minigame-frequency"
                  value="off"
                  checked={minigameFrequency === 'off'}
                  onChange={() => onMinigameFrequencyChange('off')}
                  className="accent-accent"
                />
                <span>Do not show mini-games</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="minigame-frequency"
                  value="2-5"
                  checked={minigameFrequency === '2-5'}
                  onChange={() => onMinigameFrequencyChange('2-5')}
                  className="accent-accent"
                />
                <span>Every 2–5 word cards</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="minigame-frequency"
                  value="3-7"
                  checked={minigameFrequency === '3-7'}
                  onChange={() => onMinigameFrequencyChange('3-7')}
                  className="accent-accent"
                />
                <span>Every 3–7 word cards</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="minigame-frequency"
                  value="5-10"
                  checked={minigameFrequency === '5-10'}
                  onChange={() => onMinigameFrequencyChange('5-10')}
                  className="accent-accent"
                />
                <span>Every 5–10 word cards</span>
              </label>
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
    </section>
  );
}
