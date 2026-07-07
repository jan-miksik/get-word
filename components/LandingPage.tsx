'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { InterfaceLanguageSelector } from '@/components/InterfaceLanguageSelector';
import { LandingPageStyles } from '@/components/landing/LandingPageStyles';
import { LandingDemoCard } from '@/components/LandingDemoCard';
import { getLandingDemoFallbackTo } from '@/components/landing-demo/demo-set';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { LanguageCombobox } from '@/features/learning/onboarding/LanguageCombobox';
import {
  readLandingLanguagePair,
  saveLandingLanguagePair,
} from '@/features/learning/onboarding/landingPairStorage';
import type { LearningLanguage } from '@/features/learning/onboarding/types';
import type { I18nKey } from '@/lib/i18n/messages';
import {
  DEFAULT_SETTINGS_LANGUAGE,
  getDetectedSettingsLanguage,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import { PUBLIC_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/public-language';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const GITHUB_URL = 'https://github.com/jan-miksik/get-word';
const CONTACT_EMAIL = 'contact@getword.app';
/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

const FEATURE_ICONS: ((props: { className?: string }) => React.ReactNode)[] = [
  IconBrain,
  IconCards,
  IconSpeaker,
  IconSpark,
  IconSync,
  IconInstall,
];

const FEATURE_ACCENTS: ('blue' | 'rust')[] = [
  'blue',
  'rust',
  'blue',
  'rust',
  'blue',
  'rust',
];

const STEP_NUMBERS = ['01', '02', '03'];
const LANDING_FEATURES = [
  {
    title: 'landing.features.spacedRepetition.title',
    body: 'landing.features.spacedRepetition.body',
  },
  {
    title: 'landing.features.ownLists.title',
    body: 'landing.features.ownLists.body',
  },
  {
    title: 'landing.features.audio.title',
    body: 'landing.features.audio.body',
  },
  {
    title: 'landing.features.memoryGames.title',
    body: 'landing.features.memoryGames.body',
  },
  {
    title: 'landing.features.sync.title',
    body: 'landing.features.sync.body',
  },
  {
    title: 'landing.features.install.title',
    body: 'landing.features.install.body',
  },
] satisfies Array<{ title: I18nKey; body: I18nKey }>;

const LANDING_STEPS = [
  {
    title: 'landing.how.pickPair.title',
    body: 'landing.how.pickPair.body',
  },
  {
    title: 'landing.how.studyDaily.title',
    body: 'landing.how.studyDaily.body',
  },
  {
    title: 'landing.how.remember.title',
    body: 'landing.how.remember.body',
  },
] satisfies Array<{ title: I18nKey; body: I18nKey }>;

/* ------------------------------------------------------------------ *
 * Language preference
 * ------------------------------------------------------------------ */

/**
 * Resolve the visitor's preferred landing language. A manual choice saved in
 * localStorage wins; otherwise we fall back to the browser language, then to
 * the default. Runs only on the client (depends on navigator/localStorage).
 */
function readPreferredLang(): string {
  try {
    const saved = localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    if (saved) return normalizeLanguageCode(saved);
  } catch {
    // localStorage may be unavailable (private mode) — fall through.
  }
  return getDetectedSettingsLanguage();
}

/**
 * Tiny external store for the chosen landing language. Using
 * `useSyncExternalStore` keeps SSR/hydration honest: the server (and the first
 * client paint) render the default language, then React re-renders with the
 * visitor's resolved preference without a hydration mismatch.
 */
let currentLang: string | null = null;
const langListeners = new Set<() => void>();

function getLangSnapshot(): string {
  if (currentLang === null) currentLang = readPreferredLang();
  return currentLang;
}

function getLangServerSnapshot(): string {
  return DEFAULT_SETTINGS_LANGUAGE;
}

function subscribeLang(onChange: () => void): () => void {
  langListeners.add(onChange);
  return () => langListeners.delete(onChange);
}

function setLandingLang(next: string) {
  const normalized = normalizeLanguageCode(next);
  currentLang = normalized;
  try {
    localStorage.setItem(PUBLIC_LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
  langListeners.forEach((l) => l());
}

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
  // Server + first client paint render the default language so hydration
  // matches; the store then resolves the visitor's browser/saved preference.
  const lang = useSyncExternalStore(
    subscribeLang,
    getLangSnapshot,
    getLangServerSnapshot
  );

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
  // Keep the hero pair and the app-like demo card in sync. The server snapshot
  // stays empty to avoid hydration drift; after mount we resolve saved/browser
  // defaults and then user choices take over.
  const savedFrom = useSyncExternalStore(
    noopSubscribe,
    () => readLandingLanguagePair()?.from ?? readPreferredLang(),
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
      <SpeckledBackground snapRisingLettersToMouse={false} />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6">
        <SiteHeader
          lang={lang}
          onLangChange={onLangChange}
          onBeforeLogin={persistLandingPair}
        />
        <Hero
          languageFrom={languageFrom}
          languageTo={languageTo}
          effectiveLanguageFrom={effectiveLanguageFrom}
          wantsOwnList={wantsOwnList}
          onPairChange={updateLandingPair}
          onWantsOwnListChange={setWantsOwnList}
          onBeforeLogin={persistLandingPair}
        />
        <TryIt
          lang={lang}
          languageFrom={effectiveLanguageFrom}
          languageTo={effectiveLanguageTo}
          onBeforeLogin={persistLandingPair}
        />
        <Features />
        <HowItWorks />
        <OpenSource />
        <FinalCta />
        <SiteFooter />
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

function SiteHeader({
  lang,
  onLangChange,
  onBeforeLogin,
}: {
  lang: string;
  onLangChange: (next: string) => void;
  onBeforeLogin: () => void;
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
        <Link href="/login" className="lp-btn-ghost" onClick={onBeforeLogin}>
          {t('landing.hero.getStarted')}
        </Link>
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
  return (
    // `relative z-10`: the hero and the sections below it all create stacking
    // contexts (CSS load animations), so without an explicit z-index the later
    // sections paint over the hero's open language dropdowns.
    <section className="lp-fade-in relative z-10 min-w-0 py-10 sm:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-14">
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

        <HeroLanguagePicker
          languageFrom={languageFrom}
          languageTo={languageTo}
          effectiveLanguageFrom={effectiveLanguageFrom}
          wantsOwnList={wantsOwnList}
          onPairChange={onPairChange}
          onWantsOwnListChange={onWantsOwnListChange}
          onBeforeLogin={onBeforeLogin}
        />
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
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  const [loadingLanguages, setLoadingLanguages] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/languages')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setLanguages(Array.isArray(data.languages) ? data.languages : []);
      })
      .catch(() => {
        if (!cancelled) setLanguages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLanguages(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

function Features() {
  const { t } = useI18n();
  return (
    <section className="py-12 sm:py-20">
      <SectionHeading title={t('landing.features.title')} />
      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[26px] border-2 border-[var(--ink)] bg-[var(--ink)] sm:grid-cols-2 lg:grid-cols-3">
        {LANDING_FEATURES.map((f, i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <article
              key={f.title}
              className="lp-reveal lp-feature group"
              style={{ '--d': `${i * 55}ms` } as React.CSSProperties}
            >
              <span className={`lp-feature-icon lp-accent-${FEATURE_ACCENTS[i]}`}>
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="lp-display mt-5 text-xl font-semibold text-[var(--ink)]">
                {t(f.title)}
              </h3>
              <p className="mt-2 text-[0.95rem] leading-6 text-[var(--ink-2)]">{t(f.body)}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  return (
    <section className="py-12 sm:py-20">
      <SectionHeading title={t('landing.how.title')} />
      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {LANDING_STEPS.map((s, i) => (
          <li
            key={STEP_NUMBERS[i]}
            className="lp-reveal lp-step"
            style={{ '--d': `${i * 80}ms` } as React.CSSProperties}
          >
            <span className="lp-step-n lp-display">{STEP_NUMBERS[i]}</span>
            <h3 className="lp-display mt-4 text-xl font-semibold text-[var(--ink)]">
              {t(s.title)}
            </h3>
            <p className="mt-2 text-[0.95rem] leading-6 text-[var(--ink-2)]">{t(s.body)}</p>
            {i < LANDING_STEPS.length - 1 && (
              <IconArrow className="lp-step-arrow" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function OpenSource() {
  const { t } = useI18n();
  return (
    <section className="lp-reveal py-6 sm:py-10">
      <div className="lp-opensource">
        <div className="flex items-start gap-4">
          <span className="lp-feature-icon lp-accent-rust shrink-0">
            <IconGithub className="h-6 w-6" />
          </span>
          <div>
            <h3 className="lp-display m-0 text-xl font-semibold text-[var(--ink)] sm:text-2xl">
              {t('landing.openSource.title')}
            </h3>
            <p className="m-0 mt-2 max-w-md text-[0.95rem] leading-6 text-[var(--ink-2)]">
              {t('landing.openSource.body')}
            </p>
          </div>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="lp-btn-outline group shrink-0"
        >
          <IconGithub className="h-[1.05rem] w-[1.05rem]" />
          {t('landing.openSource.cta')}
          <IconArrow className="lp-btn-arrow" />
        </a>
      </div>
    </section>
  );
}

function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="lp-reveal py-12 sm:py-20">
      <div className="lp-cta">
        <div aria-hidden className="lp-cta-halftone" />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div>
            <h2 className="lp-display m-0 text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--card-2)]">
              {t('landing.cta.title')}
            </h2>
            <p className="m-0 mt-3 max-w-md text-[0.98rem] leading-6 text-[rgba(243,234,213,0.72)]">
              {t('landing.cta.body')}
            </p>
          </div>
          <Link href="/login" className="lp-btn-cream group shrink-0">
            {t('landing.cta.button')}
            <IconArrow className="lp-btn-arrow" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="flex flex-col gap-5 border-t-2 border-[var(--line-strong)] py-9 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <AppLogo size={28} />
        <span className="lp-display text-sm font-semibold text-[var(--ink)]">
          Get&nbsp;Word
        </span>
      </div>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/login" className="lp-foot-link">{t('landing.hero.getStarted')}</Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-foot-link">
          {t('landing.footer.github')}
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="lp-foot-link">{t('landing.footer.contact')}</a>
        <Link href="/privacy" className="lp-foot-link">{t('landing.footer.privacy')}</Link>
        <Link href="/terms" className="lp-foot-link">{t('landing.footer.terms')}</Link>
      </nav>
      <p className="lp-mono m-0 text-[0.72rem] text-[var(--ink-soft)]">
        © {new Date().getFullYear()} Get Word
      </p>
    </footer>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="lp-reveal max-w-2xl">
      <h2 className="lp-heading-rule lp-display m-0 text-[clamp(1.9rem,4.5vw,2.9rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--ink)]">
        {title}
      </h2>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Icons (ink line-work)
 * ------------------------------------------------------------------ */

function svgProps(className?: string) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

function IconBrain({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 5.5a2.5 2.5 0 0 0-5 .2 2.4 2.4 0 0 0-2 3.3A2.5 2.5 0 0 0 5.5 14 2.4 2.4 0 0 0 8 17.5a2.5 2.5 0 0 0 4 .9Z" />
      <path d="M12 5.5a2.5 2.5 0 0 1 5 .2 2.4 2.4 0 0 1 2 3.3A2.5 2.5 0 0 1 18.5 14 2.4 2.4 0 0 1 16 17.5a2.5 2.5 0 0 1-4 .9Z" />
      <path d="M12 5.5v13" />
    </svg>
  );
}

function IconCards({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="6" width="13" height="13" rx="2.2" />
      <path d="M8 3.5h10.2A1.8 1.8 0 0 1 20 5.3V15" />
      <path d="M6.5 11h6M6.5 14.2h4" />
    </svg>
  );
}

function IconSpeaker({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 9v6h3l5 4V5L7 9Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

function IconSpark({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9Z" />
      <path d="M18.5 4.5v3M20 6h-3M5.5 16v2.5M6.75 17.25h-2.5" />
    </svg>
  );
}

function IconSync({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}

function IconInstall({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 17.5v1A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13" />
      <path d="m12.5 6 6 6-6 6" />
    </svg>
  );
}

function IconGithub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.8a10.2 10.2 0 0 0-3.23 19.88c.51.1.7-.22.7-.49l-.01-1.92c-2.84.62-3.44-1.2-3.44-1.2-.46-1.18-1.13-1.5-1.13-1.5-.93-.63.07-.62.07-.62 1.03.07 1.57 1.06 1.57 1.06.91 1.57 2.4 1.12 2.99.85.09-.66.36-1.12.65-1.37-2.27-.26-4.66-1.14-4.66-5.06 0-1.12.4-2.03 1.05-2.74-.1-.26-.46-1.3.1-2.7 0 0 .86-.27 2.82 1.05a9.7 9.7 0 0 1 5.13 0c1.96-1.32 2.81-1.05 2.81-1.05.56 1.4.21 2.44.1 2.7.66.71 1.05 1.62 1.05 2.74 0 3.93-2.39 4.79-4.67 5.05.37.32.69.94.69 1.9l-.01 2.82c0 .27.19.6.71.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  );
}
