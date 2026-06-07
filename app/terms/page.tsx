import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Get Word',
  description: 'The terms that govern your use of Get Word.',
};

const LAST_UPDATED = 'June 6, 2026';

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[#0b1220] px-6 py-12 text-[#e7e2d6]">
      <article className="flex flex-col gap-6 text-[0.95rem] leading-relaxed">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-[#9fb6cc] underline underline-offset-2 hover:text-white"
          >
            ← Back to Get Word
          </Link>
          <h1 className="m-0 text-3xl font-semibold text-white">Terms of Service</h1>
          <p className="m-0 text-sm text-[#9aa6b8]">Last updated: {LAST_UPDATED}</p>
        </header>

        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the hosted Get
          Word app (&ldquo;the app&rdquo;). By accessing or using the app, you agree to
          these Terms. If you do not agree, please do not use the app. Use of the
          open-source code is governed by the license included in the project
          repository, not by these Terms.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Using the app</h2>
          <p className="m-0">
            Get Word helps you learn vocabulary using spaced repetition. You may use it
            for personal, educational, and internal learning purposes. You agree not to
            misuse the app, interfere with its operation, scrape it at scale, resell
            access to the hosted service, or attempt to access it using a method other
            than the interface and instructions we provide.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Your account</h2>
          <p className="m-0">
            You may sign in using email or Google. You are responsible for keeping your
            account secure and for the activity that happens under it. You must provide
            accurate information. If you are under the age required to consent to
            personal-data processing in your country, you may use the app only with
            consent from a parent or legal guardian.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Your content</h2>
          <p className="m-0">
            Word lists and other content you create remain yours. You grant us the
            limited permission needed to store, process, display, and transmit that
            content so the app can function and sync across your devices.
          </p>
          <p className="m-0">
            If you publish, share, or make a word list public, you grant us permission to
            make that content available to other users and allow them to view, copy,
            fork, adapt, and study from it inside the app. For private lists, we use your
            content only as needed to provide the app.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Generated and translated content</h2>
          <p className="m-0">
            Translations, pronunciation audio, memory hooks, AI-generated text, and other
            learning materials may contain mistakes. Get Word is a learning aid, not a
            certified translation, education, legal, medical, or professional advice
            service.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Acceptable content and use</h2>
          <p className="m-0">
            You agree not to upload, publish, or share content that is illegal, abusive,
            infringing, deceptive, or harmful, or that violates the rights of others. We
            may remove content or restrict access if we believe it violates these Terms
            or creates risk for the app or other users.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Availability and changes</h2>
          <p className="m-0">
            The app is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
            basis. We may modify, suspend, or discontinue features at any time. We do not
            guarantee that the app will be uninterrupted or error-free.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Limitation of liability</h2>
          <p className="m-0">
            To the maximum extent permitted by law, we are not liable for any indirect,
            incidental, or consequential damages arising from your use of the app.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Termination</h2>
          <p className="m-0">
            You may stop using the app at any time. We may suspend or terminate access if
            you violate these Terms or use the app in a way that could cause harm.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Changes to these Terms</h2>
          <p className="m-0">
            We may update these Terms from time to time. Material changes will be
            reflected by the &ldquo;Last updated&rdquo; date above. Continued use of the
            app after changes means you accept the updated Terms.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Contact</h2>
          <p className="m-0">
            Questions about these Terms? Contact us at{' '}
            <span
              className="cursor-text select-text font-medium text-[#9fb6cc]"
              style={{
                WebkitTouchCallout: 'default',
                WebkitUserSelect: 'text',
                userSelect: 'text',
              }}
            >
              support@getword.app
            </span>
          </p>
        </section>

        <footer className="mt-4 border-t border-white/10 pt-4 text-sm text-[#9aa6b8]">
          See also our{' '}
          <Link
            href="/privacy"
            className="text-[#9fb6cc] underline underline-offset-2 hover:text-white"
          >
            Privacy Policy
          </Link>
          .
        </footer>
      </article>
    </main>
  );
}
