'use client';

import type { ReactNode } from 'react';
import { RevealHint } from './RevealHint';

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
  return (
    <div className="flex justify-center items-center gap-1.5">
      <div className="hidden">{hiddenLabel}</div>
      <div className="flex-none w-full text-center font-medium leading-[1.2] sm:leading-[1.25]">
        <div
          className={`cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full ${covered ? 'is-covered max-sm:py-4' : ''}`}
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
          {covered && <RevealHint />}
        </div>
      </div>
    </div>
  );
}
