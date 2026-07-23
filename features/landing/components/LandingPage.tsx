'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { InterfaceLanguageSelector } from '@/components/InterfaceLanguageSelector';
import { LandingPageStyles } from './LandingPageStyles';
import { LandingDemoCard } from './LandingDemoCard';
import { IconArrow } from './LandingIcons';
import {
  Features,
  FinalCta,
  HowItWorks,
  OpenSource,
  SectionHeading,
  SiteFooter,
} from './LandingSections';
import { getLandingDemoFallbackTo } from './demo/demo-set';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { LanguageCombobox } from '@/features/shared/languages/LanguageCombobox';
import { useSupportedLanguages } from '@/features/shared/languages/useSupportedLanguages';
import {
  readLandingLanguagePair,
  saveLandingLanguagePair,
} from '@/features/shared/languages/landingPairStorage';
import { useLandingLanguage } from '@/features/landing/client/useLandingLanguage';
import { isAndroid, isFirefox } from '@/lib/pwa-install';

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

/**
 * Public marketing landing page shown to signed-out visitors at `/`.
 * Server-rendered in English so its content is crawlable / reviewable without
 * a login, then — on the client — it switches to the visitor's browser
 * language (or a remembered manual choice) and offers a language switcher.
 *
 * Aesthetic: the app's signature speckled-parchment "frame" (SpeckledBackground)
 * with bordered cream panels and an editorial serif, accented in ink-blue and
 * rust-red. All motion is pure-CSS on-load so content is never hidden for
 * no-JS crawlers/reviewers.
 */
export function LandingPage() {
  const [lang, setLandingLang] = useLandingLanguage();

  return (
    <I18nProvider language={lang}>
      <LandingPageContent lang={lang} onLangChange={setLandingLang} />
    </I18nProvider>
  );
}

function LandingPageContent({
  lang,
  onLangChange,
}: {
  lang: string;
  onLangChange: (next: string) => void;
}) {
  const { t, isLoading } = useI18n();
  // Firefox on Android can't run the app reliably (PWA install, canvas/scratch,
  // and the OTP tab-restore flow all break). Rather than ship broken sign-in, we
  // show an unsupported notice and hide every login CTA for those visitors,
  // steering them to a Chromium browser (and later the Play Store). Detection is
  // client-only, so the server snapshot is false — no hydration drift, the CTAs
  // render on the server and are removed after mount only on Firefox-Android.
  const isFirefoxAndroid = useIsFirefoxAndroid();
  // Keep the hero pair and the app-like demo card in sync. The server snapshot
  // stays empty to avoid hydration drift; after mount we resolve saved/browser
  // defaults and then user choices take over.
  const savedFrom = useSyncExternalStore(
    noopSubscribe,
    () => readLandingLanguagePair()?.from ?? lang,
    () => ''
  );
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [wantsOwnList, setWantsOwnList] = useState(false);
  const languageFrom = fromOverride ?? savedFrom;
  const languageTo = toOverride ?? '';
  const effectiveLanguageFrom = languageFrom || lang;
  const effectiveLanguageTo =
    languageTo || getLandingDemoFallbackTo(effectiveLanguageFrom);

  function persistLandingPair() {
    saveLandingLanguagePair({
      from: languageFrom || effectiveLanguageFrom,
      // Keep the demo card personalized with a fallback target language, but do
      // not treat that fallback as an explicit onboarding choice. If the
      // visitor never picked "I want to learn", post-login onboarding should
      // still open on the language-selection step.
      to: languageTo,
      wantsOwnList,
    });
  }

  function updateLandingPair(next: { from?: string; to?: string }) {
    if (next.from !== undefined) setFromOverride(next.from);
    if (next.to !== undefined) setToOverride(next.to);
  }

  return (
    <div className="lp-root" lang={lang}>
      <LandingPageStyles />
      <SpeckledBackground
        className="lp-frame-background"
        snapRisingLettersToMouse={false}
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6">
        <SiteHeader
          lang={lang}
          onLangChange={onLangChange}
          onBeforeLogin={persistLandingPair}
          showLogin={!isFirefoxAndroid}
        />
        {isFirefoxAndroid ? <FirefoxUnsupportedNotice /> : null}
        <Hero
          languageFrom={languageFrom}
          languageTo={languageTo}
          effectiveLanguageFrom={effectiveLanguageFrom}
          wantsOwnList={wantsOwnList}
          onPairChange={updateLandingPair}
          onWantsOwnListChange={setWantsOwnList}
          onBeforeLogin={persistLandingPair}
          showLogin={!isFirefoxAndroid}
        />
        {isFirefoxAndroid ? null : (
          <TryIt
            lang={lang}
            languageFrom={effectiveLanguageFrom}
            languageTo={effectiveLanguageTo}
            onBeforeLogin={persistLandingPair}
          />
        )}
        <Features />
        <HowItWorks />
        <OpenSource />
        {isFirefoxAndroid ? null : <FinalCta />}
        <SiteFooter showLogin={!isFirefoxAndroid} />
      </div>
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-40 inline-flex items-center gap-2 rounded-full border-2 border-[var(--ink)] bg-[var(--card-2)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] shadow-[0_14px_34px_-18px_rgba(33,26,15,.55)]"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-full border-2 border-[var(--line-strong)] border-t-[var(--blue)] motion-safe:animate-spin"
          />
          {t('language.loadingInterface')}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Language switcher
 * ------------------------------------------------------------------ */

function LanguageSwitcher({
  lang,
  onLangChange,
}: {
  lang: string;
  onLangChange: (next: string) => void;
}) {
  return (
    <InterfaceLanguageSelector
      value={lang}
      onChange={onLangChange}
      align="right"
      hideLabelBelowSm
      className="max-w-[46vw] sm:max-w-none"
    />
  );
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

/**
 * Firefox on Android can't run the app reliably — PWA install, canvas/scratch,
 * and the OTP tab-restore sign-in flow all break — so instead of shipping broken
 * login we mark it unsupported and steer visitors to a Chromium browser (and,
 * later, the Play Store). Scoped to Android on purpose: iOS Firefox (FxiOS) is a
 * WebKit wrapper, not Gecko, and behaves like Safari. Detection is client-only,
 * so the server snapshot is false (SSR/first paint renders as a supported
 * browser, no hydration drift) and the true value takes over after mount.
 */
function useIsFirefoxAndroid(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isAndroid() && isFirefox(),
    () => false
  );
}

/**
 * Fixed (non-dismissible) unsupported-browser notice, shown only to Firefox on
 * Android. The gating happens in the parent; this is purely presentational.
 */
function FirefoxUnsupportedNotice() {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="lp-reveal mt-4 flex items-start gap-3 rounded-2xl border-2 border-[var(--rust)] bg-[var(--card-2)] px-5 py-4 text-sm leading-6 text-[var(--ink)] shadow-[0_16px_34px_-28px_rgba(33,26,15,.5)]"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-lg leading-6">
        🦊
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 font-semibold text-[var(--ink)]">
          {t('landing.firefoxUnsupportedTitle')}
        </p>
        <p className="m-0 mt-1 text-[var(--ink-2)]">
          {t('landing.firefoxUnsupportedBody')}
        </p>
      </div>
    </div>
  );
}

function SiteHeader({
  lang,
  onLangChange,
  onBeforeLogin,
  showLogin,
}: {
  lang: string;
  onLangChange: (next: string) => void;
  onBeforeLogin: () => void;
  showLogin: boolean;
}) {
  const { t } = useI18n();
  return (
    <header className="lp-site-header sticky top-0 z-50 -mx-4 flex items-center justify-between gap-2 px-4 py-4 sm:-mx-6 sm:gap-6 sm:px-6 sm:py-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <AppLogo
          size={38}
          className="[&>svg]:h-[34px] [&>svg]:w-[34px] sm:[&>svg]:h-[38px] sm:[&>svg]:w-[38px]"
        />
        <span className="lp-display whitespace-nowrap text-base font-semibold tracking-tight text-[var(--ink)] sm:text-lg">
          Get&nbsp;Word
        </span>
      </div>
      <nav className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <LanguageSwitcher
          lang={lang}
          onLangChange={onLangChange}
        />
        {showLogin ? (
          <Link href="/login" className="lp-btn-ghost" onClick={onBeforeLogin}>
            {t('landing.hero.getStarted')}
          </Link>
        ) : null}
      </nav>
    </header>
  );
}

function Hero({
  languageFrom,
  languageTo,
  effectiveLanguageFrom,
  wantsOwnList,
  onPairChange,
  onWantsOwnListChange,
  onBeforeLogin,
  showLogin,
}: {
  languageFrom: string;
  languageTo: string;
  effectiveLanguageFrom: string;
  wantsOwnList: boolean;
  onPairChange: (next: { from?: string; to?: string }) => void;
  onWantsOwnListChange: (next: boolean) => void;
  onBeforeLogin: () => void;
  showLogin: boolean;
}) {
  const { t } = useI18n();
  return (
    // `relative z-10`: the hero and the sections below it all create stacking
    // contexts (CSS load animations), so without an explicit z-index the later
    // sections paint over the hero's open language dropdowns.
    <section className="lp-fade-in relative z-10 min-w-0 py-10 sm:py-16">
      {/* On unsupported browsers (Firefox-Android) the language pickers and their
          login CTA are hidden, so the hero collapses to just the pitch. */}
      <div
        className={
          showLogin
            ? 'grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-14'
            : ''
        }
      >
        <div className="min-w-0">
          <h1
            className="lp-display m-0 text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[1.02] tracking-[-0.025em] text-[var(--ink)]"
          >
            {t('landing.hero.title')}
          </h1>

          <p
            className="m-0 mt-6 max-w-2xl text-[1.05rem] leading-7 text-[var(--ink-2)] sm:text-[1.2rem] sm:leading-8"
          >
            {t('landing.hero.subtitle')}
          </p>
        </div>

        {showLogin ? (
          <HeroLanguagePicker
            languageFrom={languageFrom}
            languageTo={languageTo}
            effectiveLanguageFrom={effectiveLanguageFrom}
            wantsOwnList={wantsOwnList}
            onPairChange={onPairChange}
            onWantsOwnListChange={onWantsOwnListChange}
            onBeforeLogin={onBeforeLogin}
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * "Try it yourself" — the interactive demo card in its own quiet section
 * under the hero, so the hero stays a two-beat pitch (headline → pickers)
 * and the card gets room to be played with instead of competing for
 * attention next to the CTA.
 */
function TryIt({
  lang,
  languageFrom,
  languageTo,
  onBeforeLogin,
}: {
  lang: string;
  languageFrom: string;
  languageTo: string;
  onBeforeLogin: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="py-12 sm:py-16">
      <SectionHeading title={t('landing.demo.title')} />
      <p className="lp-reveal m-0 mt-4 max-w-xl text-[0.98rem] leading-6 text-[var(--ink-2)]">
        {t('landing.demo.captionIntro')}{' '}
        <strong className="lp-demo-caption-mark">{t('landing.demo.captionScratch')}</strong>{' '}
        {t('landing.demo.captionRest')}
      </p>
      <div
        className="lp-reveal mx-auto mt-10 w-full max-w-lg"
        style={{ '--d': '80ms' } as React.CSSProperties}
      >
        <LandingDemoCard
          key={`${languageFrom}-${languageTo}-${lang}`}
          lang={lang}
          fromLang={languageFrom}
          toLang={languageTo}
          onContinueToApp={onBeforeLogin}
        />
      </div>
    </section>
  );
}

/**
 * Language-pair pickers in the hero: the visitor's first click on the site is
 * already "I know X, I want to learn Y". The choice is saved to localStorage
 * (see landingPairStorage) and read back as the initial pair by the onboarding
 * screen after login, so it survives the auth redirects.
 */
const noopSubscribe = () => () => {};

function HeroLanguagePicker({
  languageFrom,
  languageTo,
  effectiveLanguageFrom,
  wantsOwnList,
  onPairChange,
  onWantsOwnListChange,
  onBeforeLogin,
}: {
  languageFrom: string;
  languageTo: string;
  effectiveLanguageFrom: string;
  wantsOwnList: boolean;
  onPairChange: (next: { from?: string; to?: string }) => void;
  onWantsOwnListChange: (next: boolean) => void;
  onBeforeLogin: () => void;
}) {
  const { t } = useI18n();
  const { languages, loading: loadingLanguages } = useSupportedLanguages();

  function updateFrom(code: string) {
    onPairChange({ from: code });
    saveLandingLanguagePair({ from: code, to: languageTo, wantsOwnList });
  }

  function updateTo(code: string) {
    onPairChange({ to: code });
    saveLandingLanguagePair({
      from: languageFrom || effectiveLanguageFrom,
      to: code,
      wantsOwnList,
    });
  }

  function updateWantsOwnList(next: boolean) {
    onWantsOwnListChange(next);
    saveLandingLanguagePair({
      from: languageFrom || effectiveLanguageFrom,
      to: languageTo,
      wantsOwnList: next,
    });
  }

  return (
    <div className="lp-hero-picker mx-auto w-full max-w-md min-w-0 lg:mx-0 lg:max-w-none">
      <div className="grid gap-3 sm:grid-cols-2">
        <LanguageCombobox
          id="landing-language-from"
          label={t('onboarding.iKnow')}
          value={languageFrom}
          languages={languages}
          loading={loadingLanguages}
          onChange={updateFrom}
          disabledCodes={languageTo ? [languageTo] : []}
        />
        <LanguageCombobox
          id="landing-language-to"
          label={t('onboarding.iWantToLearn')}
          value={languageTo}
          languages={languages}
          loading={loadingLanguages}
          onChange={updateTo}
          disabledCodes={languageFrom ? [languageFrom] : []}
          highlight
        />
      </div>
      <div className="mt-6 flex flex-col items-stretch">
        <Link
          href="/login"
          className="lp-btn-primary lp-btn-hero group"
          onClick={onBeforeLogin}
        >
          {t('landing.hero.getStarted')}
          <IconArrow className="lp-btn-arrow" />
        </Link>
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2 px-3 text-xs font-semibold leading-5 text-[var(--ink)] sm:text-sm">
        <input
          type="checkbox"
          checked={wantsOwnList}
          onChange={(event) => updateWantsOwnList(event.target.checked)}
          className="lp-custom-list-checkbox h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
        />
        <span>{t('landing.hero.customListCheckbox')}</span>
      </label>
    </div>
  );
}
