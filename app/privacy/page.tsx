import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Get Word',
  description: 'How Get Word collects, uses, and protects your data.',
};

const LAST_UPDATED = 'June 6, 2026';

export default function PrivacyPolicyPage() {
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
          <h1 className="m-0 text-3xl font-semibold text-white">Privacy Policy</h1>
          <p className="m-0 text-sm text-[#9aa6b8]">Last updated: {LAST_UPDATED}</p>
        </header>

        <p>
          Get Word (&ldquo;the app&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
          language-learning application that helps you study vocabulary with spaced
          repetition. This Privacy Policy explains what information we collect, how we
          use it, and the choices you have.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Information we collect</h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong>Account information.</strong> When you sign in with email or
              Google, we receive and store your email address. If you use Google
              Sign-In, we receive your email address and basic profile identifier from
              Google. We do not receive your Google password.
            </li>
            <li>
              <strong>Learning data.</strong> Your word lists, study progress,
              spaced-repetition stages, memory hooks, and app preferences, so your
              learning syncs across devices.
            </li>
            <li>
              <strong>Device identifier.</strong> A random device ID stored on your
              device to associate your progress before and after you sign in.
            </li>
            <li>
              <strong>Content you submit.</strong> Words, phrases, and lists you enter or
              translate. To provide translation, pronunciation audio, and AI-assisted
              features, this text may be sent to third-party providers (see below).
            </li>
            <li>
              <strong>Connected provider accounts and API keys.</strong> If you connect
              your own AI provider account or bring your own API key (for example,
              OpenRouter) to make requests on your behalf, we store the credential needed
              to do so. API keys are encrypted before storage. We do not see your provider
              password.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">How we use your information</h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
            <li>To authenticate you and keep you signed in.</li>
            <li>To save and sync your learning progress and preferences.</li>
            <li>To operate, maintain, and improve the app.</li>
          </ul>
          <p className="m-0">
            We do not sell your personal information, and we do not use it for
            advertising.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">How your data is stored</h2>
          <p className="m-0">
            Your account and learning data are stored in a managed PostgreSQL database
            (Supabase), and authentication is handled through Supabase Auth. We retain
            your data for as long as your account is active.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Third-party services</h2>
          <p className="m-0">
            We use third-party providers to operate the app, including hosting (Vercel),
            database and authentication (Supabase), translation and text-to-speech
            (Google Cloud), and AI generation (OpenRouter). Depending on the feature you
            use, the text or audio you submit may be sent to these providers so they can
            provide the requested functionality. We may disclose information if required
            by law.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Public and permanent storage</h2>
          <p className="m-0">
            Some content, such as pronunciation audio or public word-list assets, may be
            stored on decentralized or permanent storage networks such as Arweave.
            Content stored this way may be publicly accessible and may not be possible
            for us to fully delete from the underlying network. Please do not include
            private or sensitive personal information in content that you choose to
            publish or generate for public storage.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Your choices and rights</h2>
          <p className="m-0">
            Depending on where you live, you may have rights to access, correct, delete,
            export, restrict, or object to the processing of your personal data. You may
            also have the right to lodge a complaint with your local data protection
            authority. To exercise these rights, contact us at the address below.
          </p>
          <p className="m-0">
            Deleting your account removes or anonymizes personal data associated with
            your account where reasonably possible, except where we need to keep limited
            records for legal, security, backup, or abuse-prevention purposes. Public or
            decentralized content may remain available if it has already been published
            or stored on permanent networks.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Children&rsquo;s privacy</h2>
          <p className="m-0">
            Get Word is not directed to children under 13. If you are under the age
            required to consent to personal-data processing in your country, you may use
            the app only with consent from a parent or legal guardian. In the Czech
            Republic, this age is 15. We do not knowingly collect personal information
            from children without the required consent.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Changes to this policy</h2>
          <p className="m-0">
            We may update this Privacy Policy from time to time. Material changes will be
            reflected by the &ldquo;Last updated&rdquo; date above.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-semibold text-white">Contact</h2>
          <p className="m-0">
            Questions about this policy? Contact us at{' '}
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
            href="/terms"
            className="text-[#9fb6cc] underline underline-offset-2 hover:text-white"
          >
            Terms of Service
          </Link>
          .
        </footer>
      </article>
    </main>
  );
}
