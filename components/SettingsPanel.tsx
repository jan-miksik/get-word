'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { AppInstallSection } from '@/components/settings/AppInstallSection';
import { LocalDataSection } from '@/components/settings/LocalDataSection';
import { AccountSection } from '@/components/settings/AccountSection';
import { QualityReviewSection } from '@/components/settings/QualityReviewSection';
import { RateAppLink } from '@/components/settings/RateAppLink';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose?: () => void;
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void | Promise<void>;
}

export function SettingsPanel({
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

          <LanguageSection />
          <AppInstallSection />
          <LocalDataSection isOpen={isOpen} />
          <QualityReviewSection />
          <AccountSection
            isAuthenticated={isAuthenticated}
            authEmail={authEmail}
            authAddress={authAddress}
            onSignOut={onSignOut}
          />

          <RateAppLink onNavigate={onClose} />

          <Link
            href="/reports"
            onClick={onClose}
            className="flex items-center justify-between rounded-xl border border-border-subtle bg-background-elevated px-4 py-3 text-sm text-text transition-colors hover:border-accent/40"
          >
            <span>
              <span className="block font-medium">{t('moderation.myReportsTitle')}</span>
              <span className="mt-0.5 block text-xs text-text-soft">{t('moderation.myReportsSettingsHint')}</span>
            </span>
            <span aria-hidden>→</span>
          </Link>

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
