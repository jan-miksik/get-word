'use client';

import { Fragment } from 'react';
import { PlatformLink as Link } from '@/packages/product/shared/platform/navigation';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { usePreferredPublicLanguage } from '@/lib/i18n/client-language';
import type { I18nKey } from '@/lib/i18n/messages';

const LAST_UPDATED_DATE = new Date('2026-07-31T00:00:00.000Z');
const SUPPORT_EMAIL = 'support@getword.app';

/**
 * Support is not a legal document, but it is the same thing structurally: a
 * static, localized, standalone page reachable from the footer. It shares this
 * shell rather than growing a near-identical second one.
 */
type LegalPageKind = 'terms' | 'privacy' | 'support';

type TextSection = {
  title: I18nKey;
  paragraphs?: I18nKey[];
  bullets?: I18nKey[];
};

type PageConfig = {
  title: I18nKey;
  intro: I18nKey;
  sections: TextSection[];
  contactTitle: I18nKey;
  contactBody: I18nKey;
  /** Cross-link in the footer: a template with one `{marker}` placeholder. */
  seeAlso: { template: I18nKey; marker: string; href: string; label: I18nKey };
  /** Only the two documents that can be revised carry an effective date. */
  showLastUpdated?: boolean;
};

const TERMS_SECTIONS: TextSection[] = [
  { title: 'terms.usingTitle', paragraphs: ['terms.usingBody'] },
  { title: 'terms.accountTitle', paragraphs: ['terms.accountBody'] },
  { title: 'terms.contentTitle', paragraphs: ['terms.contentBody1', 'terms.contentBody2'] },
  { title: 'terms.generatedTitle', paragraphs: ['terms.generatedBody'] },
  { title: 'terms.acceptableTitle', paragraphs: ['terms.acceptableBody'] },
  { title: 'terms.availabilityTitle', paragraphs: ['terms.availabilityBody'] },
  { title: 'terms.liabilityTitle', paragraphs: ['terms.liabilityBody'] },
  { title: 'terms.terminationTitle', paragraphs: ['terms.terminationBody'] },
  { title: 'terms.governingTitle', paragraphs: ['terms.governingBody'] },
  { title: 'terms.changesTitle', paragraphs: ['terms.changesBody'] },
];

const PRIVACY_SECTIONS: TextSection[] = [
  { title: 'privacy.controllerTitle', paragraphs: ['privacy.controllerBody'] },
  {
    title: 'privacy.infoTitle',
    bullets: [
      'privacy.infoAccount',
      'privacy.infoLearning',
      'privacy.infoDevice',
      'privacy.infoSession',
      'privacy.infoContent',
      'privacy.infoModeration',
      'privacy.infoProviders',
    ],
  },
  {
    title: 'privacy.useTitle',
    bullets: [
      'privacy.useAuth',
      'privacy.useSync',
      'privacy.useOperate',
      'privacy.useSafety',
      'privacy.useFeedback',
    ],
    paragraphs: ['privacy.useNoSell'],
  },
  { title: 'privacy.legalBasisTitle', paragraphs: ['privacy.legalBasisBody'] },
  { title: 'privacy.storageTitle', paragraphs: ['privacy.storageBody'] },
  { title: 'privacy.retentionTitle', paragraphs: ['privacy.retentionBody'] },
  { title: 'privacy.thirdPartyTitle', paragraphs: ['privacy.thirdPartyBody'] },
  { title: 'privacy.transfersTitle', paragraphs: ['privacy.transfersBody'] },
  { title: 'privacy.publicTitle', paragraphs: ['privacy.publicBody'] },
  {
    title: 'privacy.qualityReviewTitle',
    paragraphs: ['privacy.qualityReviewBody1', 'privacy.qualityReviewBody2'],
  },
  { title: 'privacy.rightsTitle', paragraphs: ['privacy.rightsBody1', 'privacy.rightsBody2'] },
  { title: 'privacy.childrenTitle', paragraphs: ['privacy.childrenBody'] },
  { title: 'privacy.changesTitle', paragraphs: ['privacy.changesBody'] },
];

const SUPPORT_SECTIONS: TextSection[] = [
  { title: 'support.helpTitle', paragraphs: ['support.helpBody'] },
  { title: 'support.bugTitle', paragraphs: ['support.bugBody'] },
  { title: 'support.accountTitle', paragraphs: ['support.accountBody'] },
  { title: 'support.privacyTitle', paragraphs: ['support.privacyBody'] },
];

const PAGES: Record<LegalPageKind, PageConfig> = {
  terms: {
    title: 'terms.title',
    intro: 'terms.intro',
    sections: TERMS_SECTIONS,
    contactTitle: 'terms.contactTitle',
    contactBody: 'terms.contactBody',
    seeAlso: {
      template: 'legal.seeAlsoPrivacy',
      marker: '{privacy}',
      href: '/privacy',
      label: 'privacy.title',
    },
    showLastUpdated: true,
  },
  privacy: {
    title: 'privacy.title',
    intro: 'privacy.intro',
    sections: PRIVACY_SECTIONS,
    contactTitle: 'privacy.contactTitle',
    contactBody: 'privacy.contactBody',
    seeAlso: {
      template: 'legal.seeAlsoTerms',
      marker: '{terms}',
      href: '/terms',
      label: 'terms.title',
    },
    showLastUpdated: true,
  },
  support: {
    title: 'support.title',
    intro: 'support.intro',
    sections: SUPPORT_SECTIONS,
    contactTitle: 'support.contactTitle',
    contactBody: 'support.contactBody',
    seeAlso: {
      template: 'legal.seeAlsoPrivacy',
      marker: '{privacy}',
      href: '/privacy',
      label: 'privacy.title',
    },
  },
};

export function LocalizedLegalPage({ kind }: { kind: LegalPageKind }) {
  const language = usePreferredPublicLanguage();
  return (
    <I18nProvider language={language}>
      <LegalArticle kind={kind} />
    </I18nProvider>
  );
}

function LegalArticle({ kind }: { kind: LegalPageKind }) {
  const { t, language } = useI18n();
  const page = PAGES[kind];
  const title = t(page.title);
  const intro = t(page.intro);
  const date = formatLastUpdated(language);
  const sections = page.sections;

  return (
    <main lang={language} className="mx-auto min-h-screen max-w-2xl bg-[#0b1220] px-6 py-12 text-[#e7e2d6]">
      <article className="flex flex-col gap-6 text-[0.95rem] leading-relaxed">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-[#9fb6cc] underline underline-offset-2 hover:text-white"
          >
            &larr; {t('legal.backHome')}
          </Link>
          <h1 className="m-0 text-3xl font-semibold text-white">{title}</h1>
          {page.showLastUpdated ? (
            <p className="m-0 text-sm text-[#9aa6b8]">
              {t('legal.lastUpdated', { date })}
            </p>
          ) : null}
        </header>

        <p>{intro}</p>

        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="m-0 text-xl font-semibold text-white">{t(section.title)}</h2>
            {section.bullets ? (
              <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
                {section.bullets.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            ) : null}
            {section.paragraphs?.map((key) => (
              <p key={key} className="m-0">
                {t(key)}
              </p>
            ))}
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">
            {t(page.contactTitle)}
          </h2>
          <p className="m-0">
            {t(page.contactBody)}{' '}
            <span
              className="cursor-text select-text font-medium text-[#9fb6cc]"
              style={{
                WebkitTouchCallout: 'default',
                WebkitUserSelect: 'text',
                userSelect: 'text',
              }}
            >
              {SUPPORT_EMAIL}
            </span>
          </p>
        </section>

        <footer className="mt-4 border-t border-white/10 pt-4 text-sm text-[#9aa6b8]">
          <LinkedTemplate
            template={t(page.seeAlso.template)}
            marker={page.seeAlso.marker}
            href={page.seeAlso.href}
            label={t(page.seeAlso.label)}
          />
        </footer>
      </article>
    </main>
  );
}

function LinkedTemplate({
  template,
  marker,
  href,
  label,
}: {
  template: string;
  marker: string;
  href: string;
  label: string;
}) {
  return (
    <>
      {template.split(marker).map((part, index, parts) => (
        <Fragment key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <Link
              href={href}
              className="text-[#9fb6cc] underline underline-offset-2 hover:text-white"
            >
              {label}
            </Link>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

function formatLastUpdated(language: string): string {
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(LAST_UPDATED_DATE);
  } catch {
    // Derive from the constant so the fallback can never drift out of sync.
    return LAST_UPDATED_DATE.toISOString().slice(0, 10);
  }
}
