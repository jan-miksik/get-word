'use client';

import { type ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useOptionalAppStateContext } from '@/context/AppStateContext';
import { RevealHint } from './RevealHint';
import { ScratchCover } from './ScratchCover';

export function LanguageRow({
  hiddenLabel,
  lang,
  covered,
  textSizeClass,
  children,
}: {
  hiddenLabel: string;
  lang: string;
  covered: boolean;
  textSizeClass: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const revealMode = useOptionalAppStateContext()?.revealMode ?? 'scratch';
  // Scratch mode keeps the answer text fully painted and lays an opaque canvas
  // on top, so erasing the canvas reveals the real text underneath. Press mode
  // hides the text (is-covered) until held.
  const isScratch = covered && revealMode === 'scratch';
  const isPressCovered = covered && !isScratch;

  return (
    <div className="flex justify-center items-center gap-1.5">
      <div className="hidden">{hiddenLabel}</div>
      <div className="flex-none w-full text-center font-medium leading-[1.2] sm:leading-[1.25]">
        <div
          className={`cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full ${isPressCovered ? 'is-covered max-sm:py-4' : ''} ${isScratch ? 'is-scratch' : ''}`}
          data-lang={lang}
        >
          {/* translate="no" keeps generated study text intact even if the user
              manually triggers Chrome translation (the page-level guard only
              blocks the automatic offer). */}
          <span
            className={`lang-text notranslate inline-block relative min-h-[1.4em] ${textSizeClass}`}
            translate="no"
          >
            {children}
          </span>
          {isPressCovered && <RevealHint />}
          {isScratch && <ScratchCover label={t('card.scratchToReveal')} />}
        </div>
      </div>
    </div>
  );
}
