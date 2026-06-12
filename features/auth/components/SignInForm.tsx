'use client';

import { Fragment, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { useI18n } from '@/components/I18nProvider';
import { getBrowserPublicOrigin } from '@/features/auth/app-url';
import { isSupabaseConfigured } from '@/features/auth/supabase/env';
import { getDeviceId } from '@/lib/device-id';

type Phase = 'idle' | 'sendingOtp' | 'awaitingOtp' | 'verifying' | 'redirecting';

interface SignInFormProps {
  /** Where to land after a successful sign-in. */
  nextPath?: string;
  /** Error surfaced by an upstream redirect (e.g. the OAuth callback). */
  initialError?: string | null;
}

/**
 * The email + Google sign-in card. Shown both at `/login` and inline on the
 * home page for signed-out visitors — email is the primary path, Google the
 * secondary one. The signed-in branch lives with each caller.
 */
export function SignInForm({ nextPath = '/', initialError = null }: SignInFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(initialError);

  const busy = phase === 'sendingOtp' || phase === 'verifying' || phase === 'redirecting';

  // Known error codes (e.g. from the OAuth callback redirect) get a localized
  // message; anything else (Supabase provider messages) is shown verbatim.
  const displayError =
    error === 'oauth_session_expired' ? t('auth.errorOauthExpired') : error;

  // The legal line embeds two links; split the localized template on its
  // {terms}/{privacy} placeholders so word order stays correct per language.
  const legalParts = t('auth.legalNotice').split(/(\{terms\}|\{privacy\})/);

  const startGoogle = useCallback(async () => {
    setError(null);
    try {
      const { createSupabaseBrowserClient } = await import('@/features/auth/supabase/browser');
      const supabase = createSupabaseBrowserClient();
      // OAuth redirects straight to the callback (a top-level GET) which has no
      // access to the localStorage device id. Drop a short-lived, same-site
      // cookie so the callback can claim this device's existing progress.
      document.cookie = `gw_device_claim=${encodeURIComponent(getDeviceId())}; path=/; max-age=600; SameSite=Lax`;
      const redirectUrl = new URL('/api/auth/callback', getBrowserPublicOrigin());
      redirectUrl.searchParams.set('next', nextPath);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl.toString() },
      });
      if (oauthError) setError(oauthError.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGoogleStart'));
    }
  }, [nextPath, t]);

  const sendOtp = useCallback(async () => {
    if (!email.trim()) return;
    setError(null);
    setPhase('sendingOtp');
    try {
      const { createSupabaseBrowserClient } = await import('@/features/auth/supabase/browser');
      const supabase = createSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (otpError) {
        setError(otpError.message);
        setPhase('idle');
        return;
      }
      setPhase('awaitingOtp');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorSendCode'));
      setPhase('idle');
    }
  }, [email, t]);

  const verifyOtp = useCallback(async () => {
    if (!otp.trim()) return;
    setError(null);
    setPhase('verifying');
    try {
      const { createSupabaseBrowserClient } = await import('@/features/auth/supabase/browser');
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email',
      });
      if (verifyError) {
        setError(verifyError.message);
        setPhase('awaitingOtp');
        return;
      }
      // Supabase cookies are now set; mint the app session (with device claim).
      setPhase('redirecting');
      const res = await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
        body: JSON.stringify({ deviceId: getDeviceId() }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setError(t('auth.errorAccountLoad'));
        setPhase('awaitingOtp');
        return;
      }
      // Soft client navigation to `nextPath`. This route differs from `/login`,
      // so the destination mounts fresh and re-hydrates as the signed-in
      // account — no full page reload needed.
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorVerifyCode'));
      setPhase('awaitingOtp');
    }
  }, [email, otp, nextPath, router, t]);

  return (
    <div className="w-full max-w-md rounded-[28px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 p-6 text-[#2A2218] backdrop-blur-sm sm:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo size={72} />
          <div className="space-y-2">
            <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
              {t('auth.brand')}
            </p>
            <h1 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-[#2A2218]">
              {t('auth.signInTitle')}
            </h1>
            <p className="m-0 text-sm leading-6 text-[#6B5E48]">
              {t('auth.signInSubtitle')}
            </p>
          </div>
        </div>

        {!configured ? (
          <p className="m-0 rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/8 px-4 py-3 text-sm text-[#8A1C1C]">
            {t('auth.notConfigured')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {phase !== 'awaitingOtp' && phase !== 'verifying' && phase !== 'redirecting' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendOtp();
                }}
                className="flex flex-col gap-2"
              >
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="min-h-12 rounded-2xl border-2 border-[#2A2218]/30 bg-[#FFF8E8] px-4 py-3 text-base text-[#2A2218] outline-none focus:border-[#1E6FA8]"
                />
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] hover:bg-[#155987] hover:border-[#155987] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {phase === 'sendingOtp' ? t('auth.sendingCode') : t('auth.emailMeCode')}
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyOtp();
                }}
                className="flex flex-col gap-2"
              >
                <p className="m-0 text-sm text-[#6B5E48]">
                  {t('auth.enterCodeSentTo', { email: email.trim() })}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="12345678"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={phase === 'verifying' || phase === 'redirecting'}
                  className="min-h-12 rounded-2xl border-2 border-[#2A2218]/30 bg-[#FFF8E8] px-4 py-3 text-center text-lg tracking-[0.4em] text-[#2A2218] outline-none focus:border-[#1E6FA8]"
                />
                <button
                  type="submit"
                  disabled={busy || !otp.trim()}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] hover:bg-[#155987] hover:border-[#155987] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {phase === 'verifying'
                    ? t('auth.verifying')
                    : phase === 'redirecting'
                      ? t('auth.signingIn')
                      : t('auth.verifyAndContinue')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhase('idle');
                    setOtp('');
                    setError(null);
                  }}
                  className="text-sm text-[#6B5E48] underline underline-offset-2"
                >
                  {t('auth.useDifferentEmail')}
                </button>
              </form>
            )}

            {phase !== 'awaitingOtp' && phase !== 'verifying' && phase !== 'redirecting' ? (
              <>
                <div className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#6B5E48]">
                  <span className="h-px flex-1 bg-[#2A2218]/15" />
                  {t('auth.or')}
                  <span className="h-px flex-1 bg-[#2A2218]/15" />
                </div>

                <button
                  type="button"
                  onClick={() => void startGoogle()}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[#2A2218] bg-[#FFF8E8] px-5 py-3 text-base font-semibold text-[#2A2218] transition-colors hover:bg-[#FBEFD0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('auth.continueWithGoogle')}
                </button>
              </>
            ) : null}
          </div>
        )}

        {displayError ? (
          <p
            className="m-0 select-text whitespace-pre-wrap break-words rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/8 px-4 py-3 text-sm text-[#8A1C1C]"
            role="alert"
          >
            {displayError}
          </p>
        ) : null}

        <p className="m-0 text-center text-xs text-[#6B5E48]">
          {legalParts.map((part, i) => {
            if (part === '{terms}') {
              return (
                <a
                  key={i}
                  href="/terms"
                  className="underline underline-offset-2 hover:text-[#2A2218]"
                >
                  {t('auth.termsOfService')}
                </a>
              );
            }
            if (part === '{privacy}') {
              return (
                <a
                  key={i}
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-[#2A2218]"
                >
                  {t('auth.privacyPolicy')}
                </a>
              );
            }
            return <Fragment key={i}>{part}</Fragment>;
          })}
        </p>
      </div>
    </div>
  );
}
