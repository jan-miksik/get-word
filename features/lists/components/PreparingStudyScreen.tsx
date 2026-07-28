'use client';

import { useI18n } from '@/components/I18nProvider';

export function PreparingStudyScreen() {
  const { t } = useI18n();

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-6 text-text"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="max-w-sm text-center">
        <div
          className="mx-auto mb-5 h-10 w-10 rounded-full border-4 border-accent/25 border-t-accent animate-spin"
          role="status"
          aria-label={t('lists.preparingStudy')}
        />
        <h1 className="text-xl font-semibold">{t('lists.preparingStudy')}</h1>
        <p className="mt-2 text-sm leading-6 text-text-soft">
          {t('lists.preparingStudyDescription')}
        </p>
      </div>
    </main>
  );
}
