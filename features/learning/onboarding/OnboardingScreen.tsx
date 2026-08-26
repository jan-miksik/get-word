'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { SupportButton } from '@/components/SupportButton';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { OnboardingProgress, type OnboardingProgressStep } from './OnboardingProgress';

/**
 * The frame every onboarding step is rendered in.
 *
 * Each step used to build its own page: its own centring, its own paddings, its
 * own card, and — on three of the five — no background at all. Those copies
 * drifted, so the flow changed shape from screen to screen. Everything that is
 * not the step's own question lives here now: the rising-letters background the
 * app already loads on, the sheet, the progress bar, Back, and support.
 *
 * Vertical layout: the screen is its own scroll viewport (`.onboarding-screen`
 * fixes the height, because in standalone/PWA mode `html, body` cannot scroll),
 * and the sheet is centred with `m-auto` rather than `items-center`. A centred
 * flex child taller than its container gets its top cut off and unreachable;
 * an auto margin centres it while it fits and simply scrolls once it does not.
 */
export type OnboardingScreenWidth = 'narrow' | 'wide';

const WIDTH_CLASS: Record<OnboardingScreenWidth, string> = {
  /** One question and its answers: the level scale, the reminder time. */
  narrow: 'max-w-xl',
  /** Screens that need two columns or a conversation: languages, goal, words. */
  wide: 'max-w-3xl',
};

export function OnboardingScreen({
  step = null,
  onBack,
  width = 'narrow',
  gutter = 'default',
  contentClassName = '',
  overlay = null,
  children,
}: {
  /** Which of the five steps this is; `null` hides the progress bar. */
  step?: OnboardingProgressStep | null;
  /** Return to the previous step. Omitted on the first one. */
  onBack?: () => void;
  width?: OnboardingScreenWidth;
  /**
   * `tight` hands a phone back the side margins: the word chat is a column of
   * bubbles that wants the width, unlike a step whose answers are buttons.
   */
  gutter?: 'default' | 'tight';
  /** Extra classes on the sheet's content wrapper (e.g. `text-center`). */
  contentClassName?: string;
  /** Fixed-position overlays that must not sit inside the sheet. */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const showHeader = step !== null || Boolean(onBack);

  return (
    <div
      style={warmPaletteVars}
      // The height query is the whole point of the third value: a short laptop
      // window is the case where a step stops fitting, and giving the frame
      // back its outer padding there is the cheapest 64px on the screen.
      className={[
        'onboarding-screen flex flex-col items-center py-6 sm:py-10 [@media(max-height:820px)]:py-3',
        gutter === 'tight' ? 'px-1 sm:px-4' : 'px-4',
      ].join(' ')}
    >
      <RisingLettersBackground variant="ambient" className="z-0" />
      <SupportButton />
      {overlay}
      <section
        className={`onboarding-page-card relative z-10 m-auto w-full p-5 motion-safe:animate-[onboarding-step-enter_240ms_cubic-bezier(0.22,1,0.36,1)_both] sm:p-7 ${WIDTH_CLASS[width]}`}
      >
        {showHeader ? (
          <div className="mb-5 flex items-center gap-2 sm:gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t('onboarding.back')}
                className="onboarding-back -ml-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 px-2 text-sm font-extrabold sm:justify-start sm:px-3"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M16 10H5m4-4-4 4 4 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="hidden sm:inline">{t('onboarding.back')}</span>
              </button>
            ) : null}
            {step ? <OnboardingProgress step={step} className="min-w-0 flex-1" /> : null}
          </div>
        ) : null}
        <div className={contentClassName}>{children}</div>
      </section>
    </div>
  );
}

/**
 * The one heading style of the flow. Desktop gets a step up in size — the
 * screens are one question each and read as cramped at phone sizes on a
 * 27" display — while phones keep exactly what they had.
 */
export function OnboardingTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1 className={`m-0 text-3xl font-black lg:text-4xl lg:leading-tight ${className}`}>
      {children}
    </h1>
  );
}

/** Supporting copy under a title, in the same one-step-up-on-desktop rhythm. */
export function OnboardingBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`m-0 text-sm leading-relaxed text-[color:var(--ob-ink-soft)] lg:text-base ${className}`}>
      {children}
    </p>
  );
}
