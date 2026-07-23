'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { SupportButton } from '@/components/SupportButton';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { useAuth } from '@/features/auth/client/useAuth';
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
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] hover:border-[#155987] hover:bg-[#155987]"
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
    [searchParams],
  );
  const callbackError = searchParams.get('error');
  // The OTP step lives in the URL (`?step=code`), not just in React state, so it
  // survives a Firefox-Android tab-restore: the browser always restores the tab's
  // URL, whereas in-memory state and even storage can be dropped.
  const initialCodeStep = searchParams.get('step') === 'code';

  const { isConnected, email: accountEmail, isAuthLoading, signOut } = useAuth();
  const language = usePreferredPublicLanguage();

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
            <SignInForm
              nextPath={nextPath}
              initialError={callbackError}
              initialCodeStep={initialCodeStep}
            />
          </div>
        </main>
      )}
      <SupportButton />
    </I18nProvider>
  );
}

export function LoginClient() {
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
