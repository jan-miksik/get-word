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
}

export function SettingsPanel({ 
  role, 
  onRoleChange, 
  showEnglish,
  onShowEnglishChange,
  showCategoryBadges,
  onShowCategoryBadgesChange,
  isOpen, 
  onClose 
}: SettingsPanelProps) {
  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Settings"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="settings-inner">
        <div style={{ position: 'relative' }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: 'transparent',
                border: 'none',
                fontSize: '1.25rem',
                color: 'var(--text-soft)',
                cursor: 'pointer',
                padding: '0.25rem',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-soft)';
              }}
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
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <p className="settings-title" style={{ marginBottom: '0.75rem' }}>Display Options</p>
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
      </div>
    </section>
  );
}
