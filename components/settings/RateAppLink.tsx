'use client';

import { useI18n } from '@/components/I18nProvider';
import { useStoreListing } from '@/hooks/useStoreListing';

/**
 * Settings entry that opens the app's store listing. Renders nothing in a
 * browser tab, where there is no listing behind the session to rate.
 */
export function RateAppLink({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { url } = useStoreListing();

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      className="flex items-center justify-between rounded-xl border border-border-subtle bg-background-elevated px-4 py-3 text-sm text-text transition-colors hover:border-accent/40"
    >
      <span>
        <span className="block font-medium">{t('settings.rateApp')}</span>
        <span className="mt-0.5 block text-xs text-text-soft">{t('settings.rateAppHint')}</span>
      </span>
      <span aria-hidden>→</span>
    </a>
  );
}
