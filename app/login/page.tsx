'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { useAuth } from '@/features/auth/client/useAuth';
import { prefetchWords } from '@/features/learning/data/wordsCache';
import { usePreferredPublicLanguage } from '@/lib/i18n/client-language';

function sanitizeNextPath(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

function SignedInCard({
  email,
  onContinue,
  onSignOut,
}: {
  email: string | null;
  onContinue: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  return (
    <main className="app overflow-y-auto overflow-x-hidden bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
      <SpeckledBackground />
      <div className="flex min-h-full w-full items-center justify-center">
        <div className="w-full max-w-md rounded-[28px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 p-6 text-[#2A2218] sm:p-8">
          <div className="flex flex-col items-center gap-5 text-center">
            <AppLogo size={72} />
            <div className="space-y-1">
              <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
                {t('auth.brand')}
              </p>
              <h1 className="m-0 text-2xl font-semibold text-[#2A2218]">
                {t('auth.signedInTitle')}
              </h1>
              {email ? (
                <p className="m-0 text-sm text-[#6B5E48]">{email}</p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] hover:bg-[#155987] hover:border-[#155987]"
              >
                {t('auth.continue')}
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#2A2218] bg-transparent px-5 py-3 text-base font-semibold text-[#2A2218] hover:bg-[#2A2218]/5"
              >
                {t('common.signOut')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next')),
    [searchParams]
  );
  // useSearchParams().get() already returns decoded text — do not decode again.
  const callbackError = searchParams.get('error');

  const { isConnected, email: accountEmail, isAuthLoading, signOut } = useAuth();
  const language = usePreferredPublicLanguage();

  // Warm the global word list while the user signs in, so landing on the app
  // after login reads it from cache instead of waiting on /api/words.
  useEffect(() => {
    prefetchWords();
  }, []);

  return (
    <I18nProvider language={language}>
      {!isAuthLoading && isConnected ? (
        <SignedInCard
          email={accountEmail ?? null}
          onContinue={() => router.replace(nextPath)}
          onSignOut={() => void signOut()}
        />
      ) : (
        <main className="app overflow-y-auto overflow-x-hidden bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
          <SpeckledBackground />
          <div className="flex min-h-full w-full items-center justify-center">
            <SignInForm nextPath={nextPath} initialError={callbackError} />
          </div>
        </main>
      )}
    </I18nProvider>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="app bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
          <SpeckledBackground />
        </main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
