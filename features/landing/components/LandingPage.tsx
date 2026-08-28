'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { InterfaceLanguageSelector } from '@/components/InterfaceLanguageSelector';
import { LandingPageStyles } from './LandingPageStyles';
import { LandingDemoCard } from './LandingDemoCard';
import {
  CompactStoreCta,
  PlayStoreLink,
  STORE_CTA_ANCHOR_ID,
  StoreFirstStartLink,
} from './LandingAppStores';
import { IconArrow } from './LandingIcons';
import {
  Choice,
  FinalCta,
  Growth,
  Marathon,
  OpenSource,
  Pairs,
  SiteFooter,
} from './LandingSections';
import { getLandingDemoFallbackTo } from './demo/demo-set';
import {
  LandingAmbientLetters,
  LandingScratchLayers,
  useDoubleActivate,
} from './LandingScratchBackground';
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
 * Aesthetic: the signed-in app's grammar — one large radius, pill controls,
 * hairline borders, wide soft shadows (see styles/tokens.css) — in a parchment
 * skin, laid over a contour map. Text sits in soft cream fields rather than in
 * frames, so the map stays visible and nothing needs an edge drawn round it.
 * All motion is pure-CSS on-load so content is never hidden for no-JS
 * crawlers/reviewers.
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
  // steering them to a Chromium browser or the Play Store build. Detection is
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
  // The scratch-field easter egg. Local state on purpose: it is not persisted,
  // so a reload always returns the page to the quiet static background.
  const [scratchMode, setScratchMode] = useState(false);
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
      wantsOwnList: true,
    });
  }

  function updateLandingPair(next: { from?: string; to?: string }) {
    if (next.from !== undefined) setFromOverride(next.from);
    if (next.to !== undefined) setToOverride(next.to);
  }

  return (
    <div className="lp-root" lang={lang}>
      <LandingPageStyles />
      {/* Background, bottom to top: the contour map on a layer of its own
          (-z-10, running the length of the page; sized from the width so page
          height cannot rescale it) → ambient rising letters (-z-9) → content.
          Double-clicking the logo fades in the scratch-field easter egg over
          the top of all of it; see LandingScratchBackground. */}
      <div aria-hidden="true" className="lp-backdrop" />
      {scratchMode ? null : <LandingAmbientLetters />}
      <LandingScratchLayers active={scratchMode} />

      {/* max-w-6xl rather than 5xl so the hero's type column can hold the
          headline on two lines in the longer languages (Ukrainian needs ~584px
          at its desktop size). The sections below keep their own narrower
          measures, so only the hero, the header and the footer use the extra
          room. */}
      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6">
        <SiteHeader
          lang={lang}
          onLangChange={onLangChange}
          onBeforeLogin={persistLandingPair}
          showLogin={!isFirefoxAndroid}
          onLogoDoubleActivate={() => setScratchMode((on) => !on)}
        />
        {isFirefoxAndroid ? <FirefoxUnsupportedNotice /> : null}
        <Hero
          lang={lang}
          languageFrom={languageFrom}
          languageTo={languageTo}
          effectiveLanguageFrom={effectiveLanguageFrom}
          demoLanguageFrom={effectiveLanguageFrom}
          demoLanguageTo={effectiveLanguageTo}
          onPairChange={updateLandingPair}
          onBeforeLogin={persistLandingPair}
          showLogin={!isFirefoxAndroid}
        />
        <Marathon />
        <Choice />
        <Growth />
        <Pairs />
        <OpenSource />
        <FinalCta showLogin={!isFirefoxAndroid} />
        {/* Last line before the footer rule. Outside FinalCta so it survives on
            Firefox-Android, where the closing button is hidden but the egg
            still works. */}
        <p className="lp-finish-bonus">{t('landing.hero.bonus')}</p>
        <SiteFooter onLogoDoubleActivate={() => setScratchMode((on) => !on)} />
      </div>
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card-2)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] shadow-[0_18px_45px_-28px_rgba(33,26,15,.55)]"
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
 * login we mark it unsupported and steer visitors to a Chromium browser or the
 * Play Store build. Scoped to Android on purpose: iOS Firefox (FxiOS) is a
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
        {/* The other way in, and for this audience the only one that does not
            require switching browsers first: the Play build is a TWA around the
            same app, but it runs on Chrome's engine rather than Gecko. */}
        <div className="mt-3">
          <PlayStoreLink />
        </div>
      </div>
    </div>
  );
}

function SiteHeader({
  lang,
  onLangChange,
  onBeforeLogin,
  showLogin,
  onLogoDoubleActivate,
}: {
  lang: string;
  onLangChange: (next: string) => void;
  onBeforeLogin: () => void;
  showLogin: boolean;
  onLogoDoubleActivate: () => void;
}) {
  const { t } = useI18n();
  const doubleActivate = useDoubleActivate(onLogoDoubleActivate);
  return (
    // Not sticky: with the scratch field running behind it the header has no
    // background of its own, so pinning it left the copy scrolling underneath
    // bare text. It now flows with the page like every other section.
    <header className="lp-site-header relative z-50 -mx-4 flex items-center justify-between gap-2 px-4 py-4 sm:-mx-6 sm:gap-6 sm:px-6 sm:py-6">
      {/* Double-click / double-tap target for the scratch-field easter egg —
          mark and wordmark together, matching the footer. Left as a plain span:
          nothing is gated behind it, and announcing a decorative toggle to
          assistive tech would be noise. */}
      <div
        className="lp-logo-egg flex min-w-0 items-center gap-2 sm:gap-3"
        {...doubleActivate}
      >
        <AppLogo
          size={38}
          className="[&>svg]:h-[34px] [&>svg]:w-[34px] sm:[&>svg]:h-[38px] sm:[&>svg]:w-[38px]"
        />
        <span className="lp-brand-label lp-display whitespace-nowrap text-base font-semibold tracking-tight text-[var(--ink)] sm:text-lg">
          Get&nbsp;Word
        </span>
      </div>
      <nav className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <LanguageSwitcher
          lang={lang}
          onLangChange={onLangChange}
        />
        {showLogin ? (
          <StoreFirstStartLink
            label={t('landing.hero.getStarted')}
            className="lp-btn-ghost"
            onBeforeLogin={onBeforeLogin}
          />
        ) : null}
      </nav>
    </header>
  );
}

/**
 * The opening screen holds exactly two objects — the language pair and the demo
 * card, both on the right — and everything on the left is plain type. That
 * ratio is the whole point: earlier versions framed the headline, the
 * subheadline and the TL;DR as separate blocks too, and seven competing objects
 * in one screen read as clutter no amount of spacing could fix.
 */
function Hero({
  lang,
  languageFrom,
  languageTo,
  effectiveLanguageFrom,
  demoLanguageFrom,
  demoLanguageTo,
  onPairChange,
  onBeforeLogin,
  showLogin,
}: {
  lang: string;
  languageFrom: string;
  languageTo: string;
  effectiveLanguageFrom: string;
  demoLanguageFrom: string;
  demoLanguageTo: string;
  onPairChange: (next: { from?: string; to?: string }) => void;
  onBeforeLogin: () => void;
  showLogin: boolean;
}) {
  const { t } = useI18n();
  return (
    // `relative z-10`: the hero and the sections below it all create stacking
    // contexts (CSS load animations), so without an explicit z-index the later
    // sections paint over the open language dropdowns.
    <section
      className={`lp-hero lp-fade-in relative z-10 ${showLogin ? '' : 'lp-hero--copy-only'}`}
    >
      <div className="lp-hero-top">
        <div className="lp-hero-lead lp-haze">
          <h1 className="lp-hero-title lp-display">{t('landing.hero.title')}</h1>
          <p className="lp-hero-subtitle">
            {/* On its own dark plaque: the one line that says what this is has
                to survive being read over a contour map at any scroll position,
                and the haze alone was not enough contrast for it. */}
            <span className="lp-plaque">{t('landing.hero.subtitle')}</span>
          </p>
        </div>

        {/* On unsupported browsers (Firefox-Android) the demo and the language
            pickers are both hidden, so the hero collapses to just the pitch. */}
        {/* The language pair is a desktop object. On a phone the first thing
            asked of a visitor is not "which two languages" but "get the app" —
            and two comboboxes with a dropdown each are the worst possible
            version of that question on a small screen. The pair is asked again
            in onboarding either way, so nothing is lost by not asking here.
            Split in CSS rather than JS: both blocks are in the HTML, so there
            is no hydration drift and no flash of the wrong call to action. */}
        <div className="lp-hero-controls">
          {showLogin ? (
            <div className="lp-desktop-only">
              <HeroLanguagePicker
                languageFrom={languageFrom}
                languageTo={languageTo}
                effectiveLanguageFrom={effectiveLanguageFrom}
                onPairChange={onPairChange}
                onBeforeLogin={onBeforeLogin}
              />
            </div>
          ) : null}
          <div id={STORE_CTA_ANCHOR_ID} className="lp-compact-only lp-hero-compact-cta">
            <CompactStoreCta
              showLogin={showLogin}
              onBeforeLogin={onBeforeLogin}
              loginLabel={t('landing.hero.getStarted')}
              loginClassName="lp-btn-primary lp-btn-hero group"
            />
          </div>
        </div>

        {/* The first screen is a full viewport tall, so something has to say
            that it is not the whole page. Decorative on purpose: it carries no
            information the scrollbar does not already give, and announcing it
            would just be noise. */}
        <span aria-hidden="true" className="lp-scroll-cue">
          <span className="lp-scroll-cue-track">
            <span className="lp-scroll-cue-dot" />
          </span>
        </span>
      </div>

      {showLogin ? (
        <div className="lp-hero-demo">
          <LandingDemoCard
            key={`${demoLanguageFrom}-${demoLanguageTo}-${lang}`}
            lang={lang}
            fromLang={demoLanguageFrom}
            toLang={demoLanguageTo}
            onContinueToApp={onBeforeLogin}
          />
          <p className="lp-demo-caption">
            <span className="lp-plaque lp-plaque--sm">{t('landing.demo.caption')}</span>
          </p>
        </div>
      ) : null}
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
  onPairChange,
  onBeforeLogin,
}: {
  languageFrom: string;
  languageTo: string;
  effectiveLanguageFrom: string;
  onPairChange: (next: { from?: string; to?: string }) => void;
  onBeforeLogin: () => void;
}) {
  const { t } = useI18n();
  const { languages, loading: loadingLanguages } = useSupportedLanguages();

  function updateFrom(code: string) {
    onPairChange({ from: code });
    saveLandingLanguagePair({ from: code, to: languageTo, wantsOwnList: true });
  }

  function updateTo(code: string) {
    onPairChange({ to: code });
    saveLandingLanguagePair({
      from: languageFrom || effectiveLanguageFrom,
      to: code,
      wantsOwnList: true,
    });
  }

  return (
    <div className="lp-hero-picker mx-auto w-full max-w-md min-w-0 lg:mx-0 lg:max-w-none">
      {/* lp-hero-pair: the two pickers share row tracks, so a label that wraps
          to two lines (English "I want to learn" does at this column width) does
          not push its own field half a line below its neighbour. */}
      <div className="lp-hero-pair grid gap-3 sm:grid-cols-2">
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
    </div>
  );
}
