'use client';

import Link from 'next/link';

interface SettingsPanelProps {
  role: 'cz' | 'vi';
  onRoleChange: (role: 'cz' | 'vi') => void;
  isOpen: boolean;
}

export function SettingsPanel({ role, onRoleChange, isOpen }: SettingsPanelProps) {
  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Settings"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="settings-inner">
        <p className="settings-title">Who are you?</p>
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
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <Link
            href="/edit"
            style={{
              display: 'block',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text)',
              textDecoration: 'none',
              textAlign: 'center',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-elevated)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            ✏️ Edit Words
          </Link>
        </div>
      </div>
    </section>
  );
}
