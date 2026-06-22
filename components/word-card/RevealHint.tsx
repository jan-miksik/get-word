'use client';

import { useI18n } from '@/components/I18nProvider';
import { useOptionalAppStateContext } from '@/context/AppStateContext';

export function RevealHint() {
  const { t } = useI18n();
  const appState = useOptionalAppStateContext();
  // The "second press shows everything" line only makes sense while progressive
  // reveal is on. Read it from the setting directly so it renders deterministically
  // on a fresh load (default on), rather than waiting for a JS-set html attribute.
  const showSecondPressHint = appState?.progressiveRevealEnabled ?? true;

  return (
    <span
      aria-hidden="true"
      className="reveal-hint pointer-events-none absolute inset-x-[-0.625rem] inset-y-[-0.1875rem] z-[3] flex flex-col items-center justify-center gap-1 rounded-xl"
    >
      <span className="reveal-hint__label inline-block max-w-[19rem] px-2 text-center font-medium leading-[1.2] tracking-[0.01em] text-[#f4efe1]">
        {t('card.tapToReveal')}
      </span>
      {showSecondPressHint && (
        <span className="reveal-hint__sub inline-block max-w-[19rem] px-2 text-center font-medium leading-[1.3] tracking-[0.01em] text-[#f4efe1]">
          {t('card.tapToRevealHint')}
        </span>
      )}
    </span>
  );
}
