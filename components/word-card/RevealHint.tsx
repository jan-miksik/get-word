'use client';

import { useI18n } from '@/components/I18nProvider';

export function RevealHint() {
  const { t } = useI18n();

  return (
    <span
      aria-hidden="true"
      className="reveal-hint pointer-events-none absolute inset-x-[-0.625rem] inset-y-[-0.1875rem] z-[3] flex items-center justify-center rounded-xl transition-[opacity,transform] duration-500 ease-out"
    >
      <span className="reveal-hint__label text-[0.6rem] font-bold uppercase tracking-[0.13em] text-[#6b5e48]">
        {t('card.tapToReveal')}
      </span>
    </span>
  );
}
