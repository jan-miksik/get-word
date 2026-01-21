'use client';

interface SettingsPanelProps {
  role: 'cz' | 'vi';
  onRoleChange: (role: 'cz' | 'vi') => void;
  showEnglish: boolean;
  onShowEnglishChange: (show: boolean) => void;
  showCategoryBadges: boolean;
  onShowCategoryBadgesChange: (show: boolean) => void;
  isOpen: boolean;
  onClose?: () => void;
  userId?: string | null;
}

export function SettingsPanel({ 
  role, 
  onRoleChange, 
  showEnglish,
  onShowEnglishChange,
  showCategoryBadges,
  onShowCategoryBadgesChange,
  isOpen, 
  onClose,
  userId,
}: SettingsPanelProps) {
  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Settings"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="settings-inner">
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
          <p className="settings-title">Who are you?</p>
        </div>
        <label className="settings-option">
          <input
            type="radio"
            name="learner-role"
            value="cz"
            checked={role === 'cz'}
            onChange={() => onRoleChange('cz')}
          />
          <span>I am Czech</span>
        </label>
        <label className="settings-option">
          <input
            type="radio"
            name="learner-role"
            value="vi"
            checked={role === 'vi'}
            onChange={() => onRoleChange('vi')}
          />
          <span>I am Vietnamese</span>
        </label>

        {/* Display Options Section */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="settings-title mb-3">Display Options</p>
          <label className="settings-option">
            <input
              type="checkbox"
              checked={showEnglish}
              onChange={(e) => onShowEnglishChange(e.target.checked)}
            />
            <span>Show English</span>
          </label>
          <label className="settings-option">
            <input
              type="checkbox"
              checked={showCategoryBadges}
              onChange={(e) => onShowCategoryBadgesChange(e.target.checked)}
            />
            <span>Show Category Badges</span>
          </label>
        </div>

        {/* User ID */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="settings-title mb-2">User ID</p>
          <code className="block text-xs text-text-soft break-all font-mono">
            {userId || '—'}
          </code>
        </div>
      </div>
    </section>
  );
}
