'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { usePreferredPublicLanguage } from '@/lib/i18n/client-language';
import type { I18nKey } from '@/lib/i18n/messages';

const LAST_UPDATED_DATE = new Date('2026-07-24T00:00:00.000Z');
const SUPPORT_EMAIL = 'support@getword.app';

type LegalPageKind = 'terms' | 'privacy';

type TextSection = {
  title: I18nKey;
  paragraphs?: I18nKey[];
  bullets?: I18nKey[];
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
      'privacy.infoProviders',
    ],
  },
  {
    title: 'privacy.useTitle',
    bullets: ['privacy.useAuth', 'privacy.useSync', 'privacy.useOperate', 'privacy.useFeedback'],
    paragraphs: ['privacy.useNoSell'],
  },
  { title: 'privacy.legalBasisTitle', paragraphs: ['privacy.legalBasisBody'] },
  { title: 'privacy.storageTitle', paragraphs: ['privacy.storageBody'] },
  { title: 'privacy.retentionTitle', paragraphs: ['privacy.retentionBody'] },
  { title: 'privacy.thirdPartyTitle', paragraphs: ['privacy.thirdPartyBody'] },
  { title: 'privacy.transfersTitle', paragraphs: ['privacy.transfersBody'] },
  { title: 'privacy.publicTitle', paragraphs: ['privacy.publicBody'] },
  { title: 'privacy.rightsTitle', paragraphs: ['privacy.rightsBody1', 'privacy.rightsBody2'] },
  { title: 'privacy.childrenTitle', paragraphs: ['privacy.childrenBody'] },
  { title: 'privacy.changesTitle', paragraphs: ['privacy.changesBody'] },
];

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
  const isTerms = kind === 'terms';
  const title = t(isTerms ? 'terms.title' : 'privacy.title');
  const intro = t(isTerms ? 'terms.intro' : 'privacy.intro');
  const date = formatLastUpdated(language);
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;

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
          <p className="m-0 text-sm text-[#9aa6b8]">
            {t('legal.lastUpdated', { date })}
          </p>
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
            {t(isTerms ? 'terms.contactTitle' : 'privacy.contactTitle')}
          </h2>
          <p className="m-0">
            {t(isTerms ? 'terms.contactBody' : 'privacy.contactBody')}{' '}
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
          {isTerms ? (
            <LinkedTemplate
              template={t('legal.seeAlsoPrivacy')}
              marker="{privacy}"
              href="/privacy"
              label={t('privacy.title')}
            />
          ) : (
            <LinkedTemplate
              template={t('legal.seeAlsoTerms')}
              marker="{terms}"
              href="/terms"
              label={t('terms.title')}
            />
          )}
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
