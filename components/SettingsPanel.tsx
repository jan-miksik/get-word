'use client';

import type { MinigameFrequencyRange } from '@/lib/minigames';
import { useI18n } from '@/components/I18nProvider';
import { MemoryHooksSection } from '@/components/settings/MemoryHooksSection';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { LearningLanguageSection } from '@/components/settings/LearningLanguageSection';
import { MinigamesSection } from '@/components/settings/MinigamesSection';
import { AppInstallSection } from '@/components/settings/AppInstallSection';
import { LocalDataSection } from '@/components/settings/LocalDataSection';
import { AccountSection } from '@/components/settings/AccountSection';

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
  const { t } = useI18n();

  return (
    <section
      className={`settings-panel ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label={t('common.settings')}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div className="panel-backdrop" onClick={onClose} aria-hidden />
      )}
      <div className="panel-content">
        <div className="p-5 sm:p-6 flex flex-col gap-4">

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

          <MemoryHooksSection />
          <LanguageSection />
          <LearningLanguageSection />
          <MinigamesSection
            minigameFrequency={minigameFrequency}
            onMinigameFrequencyChange={onMinigameFrequencyChange}
          />
          <AppInstallSection />
          <LocalDataSection isOpen={isOpen} />
          <AccountSection
            isAuthenticated={isAuthenticated}
            authEmail={authEmail}
            authAddress={authAddress}
            onSignOut={onSignOut}
          />

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
