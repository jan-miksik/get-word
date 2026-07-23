import type { Metadata } from 'next';
import Link from 'next/link';

const SUPPORT_EMAIL = 'support@getword.app';

export const metadata: Metadata = {
  title: 'Account and Data Deletion - Get Word',
  description: 'How Get Word users can request deletion of their account or selected app data.',
  alternates: {
    canonical: '/account-deletion',
  },
};

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#0b1220] px-6 py-12 text-[#e7e2d6]">
      <article className="flex flex-col gap-8 text-[0.95rem] leading-relaxed">
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-sm text-[#9fb6cc] underline underline-offset-2 hover:text-white"
          >
            &larr; Back to Get Word
          </Link>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm text-[#9aa6b8]">Last updated: July 23, 2026</p>
            <h1 className="m-0 text-3xl font-semibold text-white">
              Account and data deletion for Get Word
            </h1>
          </div>
          <p className="m-0">
            This page explains how users of Get Word can delete their account or
            request deletion of selected data without deleting the whole account.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold text-white">Delete your account</h2>
          <p className="m-0">
            If you can sign in to Get Word, open the app, go to Settings, then
            Account, and choose Delete account. The app will show a preview of
            what will be deleted or anonymized before you confirm.
          </p>
          <p className="m-0">
            If you cannot sign in, email{' '}
            <span className="select-text font-medium text-[#9fb6cc]">{SUPPORT_EMAIL}</span>{' '}
            from the email address connected to your Get Word account, or include
            enough information for us to verify that the account belongs to you.
            Use the subject line &quot;Get Word account deletion request&quot;.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold text-white">
            Request deletion of selected data
          </h2>
          <p className="m-0">
            You can delete some data without deleting your account. In the app you
            can delete your own word lists, list items, Photo Lab photos stored on
            your device, and local learning cache. You can also request deletion
            of selected Get Word data by emailing{' '}
            <span className="select-text font-medium text-[#9fb6cc]">{SUPPORT_EMAIL}</span>{' '}
            with the subject line &quot;Get Word data deletion request&quot;.
          </p>
          <p className="m-0">
            In your request, tell us which data you want deleted, such as learning
            progress, private word lists, memory hooks, Photo Lab data, connected
            provider credentials, or local-device records associated with your
            account.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold text-white">What is deleted</h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
            <li>Your Get Word account record and sign-in identity are deleted where possible.</li>
            <li>
              Your private learning data is deleted, including progress, notes,
              memory hooks, app preferences, device/session data, usage records,
              private lists, and saved provider API keys.
            </li>
            <li>
              Local browser data can be cleared from the app settings or by
              clearing site data in your browser.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold text-white">What may be kept</h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
            <li>
              Public, shared, recommended, or subscribed word lists may be kept
              if other learners use them. In that case, personal ownership is
              removed or anonymized.
            </li>
            <li>
              Content already published to public or permanent storage networks,
              such as generated pronunciation audio stored on Arweave, may remain
              available if the underlying network cannot fully delete it.
            </li>
            <li>
              Operational logs, backups, rate-limit records, security records,
              and abuse-prevention records may be kept for up to 90 days after
              deletion, unless a longer period is required for legal compliance,
              fraud prevention, dispute handling, or security.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold text-white">Timing</h2>
          <p className="m-0">
            In-app account deletion starts immediately after confirmation. Email
            requests are reviewed and processed as soon as reasonably possible,
            normally within 30 days after we verify the request.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-5 text-sm text-[#9aa6b8]">
          For more detail, see the{' '}
          <Link href="/privacy" className="text-[#9fb6cc] underline underline-offset-2 hover:text-white">
            Get Word Privacy Policy
          </Link>
          .
        </footer>
      </article>
    </main>
  );
}
