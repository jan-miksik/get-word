'use client';

import type { ReactNode } from 'react';
import { RevealHint } from './RevealHint';

export function LanguageRow({
  hiddenLabel,
  lang,
  covered,
  textSizeClass,
  revealText,
  children,
}: {
  hiddenLabel: string;
  lang: string;
  covered: boolean;
  textSizeClass: string;
  revealText?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-center items-center gap-1.5">
      <div className="hidden">{hiddenLabel}</div>
      <div className="flex-none w-full text-center font-medium leading-[1.2] sm:leading-[1.25]">
        <div
          className={`cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full ${covered ? 'is-covered max-sm:py-4' : ''}`}
          data-lang={lang}
          data-reveal-text={revealText}
        >
          <span
            className={`lang-text inline-block relative min-h-[1.4em] ${textSizeClass}`}
            data-reveal-mask=""
          >
            {children}
          </span>
          {covered && <RevealHint />}
        </div>
      </div>
    </div>
  );
}
