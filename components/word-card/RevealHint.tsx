'use client';

import { useI18n } from '@/components/I18nProvider';

export function RevealHint() {
  const { t } = useI18n();

  return (
    <span
      aria-hidden="true"
      className="reveal-hint pointer-events-none absolute inset-x-[-0.625rem] inset-y-[-0.1875rem] z-[3] flex flex-col items-center justify-center gap-1 rounded-xl"
    >
      <span className="reveal-hint__label inline-block max-w-[19rem] px-2 text-center font-medium leading-[1.2] tracking-[0.01em] text-[#f4efe1]">
        {t('card.tapToReveal')}
      </span>
    </span>
  );
}
