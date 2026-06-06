'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { useAuth } from '@/features/auth/client/useAuth';
import { isSupabaseConfigured } from '@/features/auth/supabase/env';
import { getDeviceId } from '@/lib/device-id';

function sanitizeNextPath(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

type Phase = 'idle' | 'sendingOtp' | 'awaitingOtp' | 'verifying' | 'redirecting';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next')),
    [searchParams]
  );
  const callbackError = searchParams.get('error');

  const { isConnected, email: accountEmail, isAuthLoading, signOut } = useAuth();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  // useSearchParams().get() already returns decoded text — do not decode again.
  const [error, setError] = useState<string | null>(callbackError);

  const busy = phase === 'sendingOtp' || phase === 'verifying' || phase === 'redirecting';

  const startGoogle = useCallback(async () => {
    setError(null);
    try {
      const { createSupabaseBrowserClient } = await import('@/features/auth/supabase/browser');
      const supabase = createSupabaseBrowserClient();
      // OAuth redirects straight to the callback (a top-level GET) which has no
      // access to the localStorage device id. Drop a short-lived, same-site
      // cookie so the callback can claim this device's existing progress.
      document.cookie = `gw_device_claim=${encodeURIComponent(getDeviceId())}; path=/; max-age=600; SameSite=Lax`;
      const redirectTo = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) setError(oauthError.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google sign-in');
    }
  }, [nextPath]);

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
      setError(err instanceof Error ? err.message : 'Failed to send code');
      setPhase('idle');
    }
  }, [email]);

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
        setError('Signed in, but could not load your account. Please try again.');
        setPhase('awaitingOtp');
        return;
      }
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify code');
      setPhase('awaitingOtp');
    }
  }, [email, otp, nextPath, router]);

  // Already signed in: offer to continue or sign out.
  if (!isAuthLoading && isConnected) {
    return (
      <main className="app bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
        <SpeckledBackground />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md rounded-[28px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 p-6 text-[#2A2218] sm:p-8">
            <div className="flex flex-col items-center gap-5 text-center">
              <AppLogo size={72} />
              <div className="space-y-1">
                <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
                  Get Word
                </p>
                <h1 className="m-0 text-2xl font-semibold text-[#2A2218]">Signed in</h1>
                {accountEmail ? (
                  <p className="m-0 text-sm text-[#6B5E48]">{accountEmail}</p>
                ) : null}
              </div>
              <div className="flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={() => router.replace(nextPath)}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] hover:bg-[#155987] hover:border-[#155987]"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#2A2218] bg-transparent px-5 py-3 text-base font-semibold text-[#2A2218] hover:bg-[#2A2218]/5"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
      <SpeckledBackground />
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md rounded-[28px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 p-6 text-[#2A2218] backdrop-blur-sm sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AppLogo size={72} />
              <div className="space-y-2">
                <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
                  Get Word
                </p>
                <h1 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-[#2A2218]">
                  Sign in
                </h1>
                <p className="m-0 text-sm leading-6 text-[#6B5E48]">
                  Continue with Google or your email.
                </p>
              </div>
            </div>

            {!configured ? (
              <p className="m-0 rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/8 px-4 py-3 text-sm text-[#8A1C1C]">
                Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void startGoogle()}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[#2A2218] bg-[#FFF8E8] px-5 py-3 text-base font-semibold text-[#2A2218] transition-colors hover:bg-[#FBEFD0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#6B5E48]">
                  <span className="h-px flex-1 bg-[#2A2218]/15" />
                  or
                  <span className="h-px flex-1 bg-[#2A2218]/15" />
                </div>

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
                      {phase === 'sendingOtp' ? 'Sending code…' : 'Email me a code'}
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
                      Enter the code sent to {email.trim()}.
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
                        ? 'Verifying…'
                        : phase === 'redirecting'
                          ? 'Signing in…'
                          : 'Verify & continue'}
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
                      Use a different email
                    </button>
                  </form>
                )}
              </div>
            )}

            {error ? (
              <p
                className="m-0 rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/8 px-4 py-3 text-sm text-[#8A1C1C]"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
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
