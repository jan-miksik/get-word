'use client';

import { AppLogo } from '@/components/AppLogo';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { useI18n } from '@/components/I18nProvider';

/**
 * Terminal state for a boot that never completed. The app needs an identity
 * (`/api/auth/me`) and a first sync payload (`/api/sync`) before it can render;
 * when either one fails or times out there is nothing to fall back to, so we
 * say so and offer a retry instead of holding the loading screen forever.
 */
export function BootErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-paper-glow/98 px-6">
      <RisingLettersBackground variant="loader" count={48} className="z-0" />

      <div className="relative z-10 flex max-w-sm flex-col items-center text-center">
        <AppLogo
          size={72}
          showLabel
          className="flex-col gap-5"
          labelClassName="text-brown-deep/55 text-[0.65rem] tracking-[0.45em]"
        />
        <h1 className="mt-8 text-lg font-bold text-brown-deep">{t('boot.stuckTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-brown-deep/70">{t('boot.stuckBody')}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-full bg-brown-deep px-6 py-2.5 text-sm font-semibold text-paper-glow transition-opacity hover:opacity-85"
        >
          {t('boot.retry')}
        </button>
      </div>
    </div>
  );
}
