import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';
import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import {
  IconArrow,
  IconBrain,
  IconCards,
  IconGithub,
  IconInstall,
  IconSpark,
  IconSpeaker,
  IconSync,
} from './LandingIcons';

const GITHUB_URL = 'https://github.com/jan-miksik/get-word';
const CONTACT_EMAIL = 'contact@getword.app';
const STEP_NUMBERS = ['01', '02', '03'];
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
const LANDING_FEATURES = [
  {
    title: 'landing.features.spacedRepetition.title',
    body: 'landing.features.spacedRepetition.body',
  },
  { title: 'landing.features.ownLists.title', body: 'landing.features.ownLists.body' },
  { title: 'landing.features.audio.title', body: 'landing.features.audio.body' },
  { title: 'landing.features.memoryGames.title', body: 'landing.features.memoryGames.body' },
  { title: 'landing.features.sync.title', body: 'landing.features.sync.body' },
  { title: 'landing.features.install.title', body: 'landing.features.install.body' },
] satisfies Array<{ title: I18nKey; body: I18nKey }>;
const LANDING_STEPS = [
  { title: 'landing.how.pickPair.title', body: 'landing.how.pickPair.body' },
  { title: 'landing.how.studyDaily.title', body: 'landing.how.studyDaily.body' },
  { title: 'landing.how.remember.title', body: 'landing.how.remember.body' },
] satisfies Array<{ title: I18nKey; body: I18nKey }>;

export function Features() {
  const { t } = useI18n();
  return (
    <section className="py-12 sm:py-20">
      <SectionHeading title={t('landing.features.title')} />
      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[26px] border-2 border-[var(--ink)] bg-[var(--ink)] sm:grid-cols-2 lg:grid-cols-3">
        {LANDING_FEATURES.map((feature, index) => {
          const Icon = FEATURE_ICONS[index];
          return (
            <article
              key={feature.title}
              className="lp-reveal lp-feature group"
              style={{ '--d': `${index * 55}ms` } as React.CSSProperties}
            >
              <span className={`lp-feature-icon lp-accent-${FEATURE_ACCENTS[index]}`}>
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="lp-display mt-5 text-xl font-semibold text-[var(--ink)]">
                {t(feature.title)}
              </h3>
              <p className="mt-2 text-[0.95rem] leading-6 text-[var(--ink-2)]">
                {t(feature.body)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function HowItWorks() {
  const { t } = useI18n();
  return (
    <section className="py-12 sm:py-20">
      <SectionHeading title={t('landing.how.title')} />
      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {LANDING_STEPS.map((step, index) => (
          <li
            key={STEP_NUMBERS[index]}
            className="lp-reveal lp-step"
            style={{ '--d': `${index * 80}ms` } as React.CSSProperties}
          >
            <span className="lp-step-n lp-display">{STEP_NUMBERS[index]}</span>
            <h3 className="lp-display mt-4 text-xl font-semibold text-[var(--ink)]">
              {t(step.title)}
            </h3>
            <p className="mt-2 text-[0.95rem] leading-6 text-[var(--ink-2)]">{t(step.body)}</p>
            {index < LANDING_STEPS.length - 1 && (
              <IconArrow className="lp-step-arrow" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OpenSource() {
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
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-btn-outline group shrink-0">
          <IconGithub className="h-[1.05rem] w-[1.05rem]" />
          {t('landing.openSource.cta')}
          <IconArrow className="lp-btn-arrow" />
        </a>
      </div>
    </section>
  );
}

export function FinalCta() {
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

export function SiteFooter({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useI18n();
  return (
    <footer className="flex flex-col gap-5 border-t-2 border-[var(--line-strong)] py-9 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <AppLogo size={28} />
        <span className="lp-display text-sm font-semibold text-[var(--ink)]">Get&nbsp;Word</span>
      </div>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {showLogin ? (
          <Link href="/login" className="lp-foot-link">{t('landing.hero.getStarted')}</Link>
        ) : null}
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-foot-link">
          {t('landing.footer.github')}
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="lp-foot-link">{t('landing.footer.contact')}</a>
        <Link href="/support" className="lp-foot-link">{t('landing.footer.support')}</Link>
        <Link href="/privacy" className="lp-foot-link">{t('landing.footer.privacy')}</Link>
        <Link href="/terms" className="lp-foot-link">{t('landing.footer.terms')}</Link>
      </nav>
      <p className="lp-mono m-0 text-[0.72rem] text-[var(--ink-soft)]">
        © {new Date().getFullYear()} Get Word
      </p>
    </footer>
  );
}

export function SectionHeading({ title }: { title: string }) {
  return (
    <div className="lp-reveal max-w-2xl">
      <h2 className="lp-heading-rule lp-display m-0 text-[clamp(1.9rem,4.5vw,2.9rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--ink)]">
        {title}
      </h2>
    </div>
  );
}
