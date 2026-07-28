'use client';

import { useI18n } from '@/components/I18nProvider';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';

type Props = {
  pair: { from: string; to: string };
  onDismiss: () => void;
};

export function LanguagePairChangedBanner({ pair, onDismiss }: Props) {
  const { t, language: uiLanguage } = useI18n();
  const from =
    getLocalizedLanguageName(pair.from, uiLanguage) ?? pair.from.toUpperCase();
  const to =
    getLocalizedLanguageName(pair.to, uiLanguage) ?? pair.to.toUpperCase();

  return (
    <div
      role="status"
      className="onboarding-notice mb-4 flex items-center gap-2 rounded-xl py-2 pl-3 pr-1.5 text-xs font-bold"
    >
      <span className="min-w-0 flex-1 text-center">
        {t('wordChat.languagePairChanged', { from, to })}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        title={t('common.close')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        ×
      </button>
    </div>
  );
}
