'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { useI18n } from '@/components/I18nProvider';
import { getBrowserPublicOrigin } from '@/features/auth/app-url';
import { isSupabaseConfigured } from '@/features/auth/supabase/env';
import { getDeviceId } from '@/lib/device-id';
import { apiFetch } from '@/features/shared/http/api-runtime';

type Phase = 'idle' | 'sendingOtp' | 'awaitingOtp' | 'verifying' | 'redirecting';

// A single reserved account signs in with a fixed password instead of an email
// OTP, so Google Play reviewers get reusable credentials that never need inbox
// access or a one-time code. Regular users never type this exact address, so the
// password field stays invisible to them. The user is created in Supabase Auth
// with a confirmed email + password; nothing here grants extra privileges — it
// only picks the password sign-in path. Reviewer-facing strings are hardcoded in
// English on purpose (Play Console requires English) and this path is never shown
// to normal users, so it stays out of the i18n locale files.
const PASSWORD_LOGIN_EMAIL = 'play-review@getword.app';

function isPasswordLoginEmail(value: string): boolean {
  return value.trim().toLowerCase() === PASSWORD_LOGIN_EMAIL;
}

// Which step we're on (email vs. code) lives in the URL (`?step=code`) so it
// survives a Firefox-Android tab-restore — the browser always restores the tab's
// URL even when it drops in-memory state and storage. Storage holds only the
// email address, which we can't put in the URL (PII) but need to run the verify.
// If the restore also wiped storage, the URL still lands on the code step and we
// fall back to asking for a fresh code. The OTP itself is never persisted:
// numeric OTP verify is stateless, so the user just re-enters the emailed code.
const OTP_PENDING_STORAGE_KEY = 'get-word-auth-otp-pending';
const OTP_PENDING_MAX_AGE_MS = 60 * 60 * 1000;

type PendingOtp = { email: string; createdAt: number };

function readPendingOtp(): PendingOtp | null {
  if (typeof window === 'undefined') return null;
  // sessionStorage is the primary home, but Firefox can clear it during a tab
  // restore, so localStorage is the durable fallback. First valid record wins.
  for (const storage of [window.sessionStorage, window.localStorage]) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(OTP_PENDING_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<PendingOtp>;
      if (
        typeof parsed.email === 'string' &&
        parsed.email.length > 0 &&
        typeof parsed.createdAt === 'number' &&
        Date.now() - parsed.createdAt <= OTP_PENDING_MAX_AGE_MS
      ) {
        return { email: parsed.email, createdAt: parsed.createdAt };
      }
    } catch {
      // Ignore malformed entries.
    }
  }
  return null;
}

function writePendingOtp(email: string) {
  if (typeof window === 'undefined') return;
  const value = JSON.stringify({ email, createdAt: Date.now() } satisfies PendingOtp);
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.setItem(OTP_PENDING_STORAGE_KEY, value);
    } catch {
      // Best effort only — one storage throwing must not skip the other.
    }
  }
}

function clearPendingOtp() {
  if (typeof window === 'undefined') return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.removeItem(OTP_PENDING_STORAGE_KEY);
    } catch {
      // Best effort only.
    }
  }
}

// Official Google "G" mark (four-color), inlined so it needs no network fetch.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7955 2.7164v2.2581h2.9082c1.7018-1.5668 2.6837-3.874 2.6837-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9082-2.2581c-.8059.54-1.8368.8595-3.0482.8595-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}

interface SignInFormProps {
  /** Where to land after a successful sign-in. */
  nextPath?: string;
  /** Error surfaced by an upstream redirect (e.g. the OAuth callback). */
  initialError?: string | null;
  /**
   * Whether the URL (`?step=code`) asked for the code-entry step. This is the
   * authoritative source for which step to show, so it survives a tab-restore.
   */
  initialCodeStep?: boolean;
}

/**
 * The email + Google sign-in card, shown at `/login`. The two-step email flow
 * (enter email → enter code) keeps its step in the URL rather than only in React
 * state, so the correct screen returns after a reload or a Firefox-Android
 * tab-restore. Google is the secondary path; the signed-in branch lives with the
 * caller.
 */
export function SignInForm({
  nextPath = '/',
  initialError = null,
  initialCodeStep = false,
}: SignInFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  // The URL decides the initial step; state only drives transient in-session
  // phases (sending/verifying/redirecting) on top of it.
  const [phase, setPhase] = useState<Phase>(initialCodeStep ? 'awaitingOtp' : 'idle');
  const [error, setError] = useState<string | null>(initialError);

  // Preserve `next` when we flip the `step` marker on or off.
  const buildLoginUrl = useCallback(
    (step: 'code' | null): string => {
      const params = new URLSearchParams();
      if (step) params.set('step', step);
      if (nextPath && nextPath !== '/') params.set('next', nextPath);
      const qs = params.toString();
      return qs ? `/login?${qs}` : '/login';
    },
    [nextPath],
  );

  // The step came from the URL; the email it needs (for verify + display) comes
  // from storage. Restore it on mount. If the URL says code step but storage was
  // also wiped, there's no email to verify against — drop back to the email step
  // with a clear "send a new code" message instead of a dead code screen.
  useEffect(() => {
    const pending = readPendingOtp();
    if (pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time restore from storage
      setEmail(pending.email);
      return;
    }
    if (initialCodeStep) {
      setPhase('idle');
      setError(t('auth.errorOtpSessionExpired'));
      router.replace(buildLoginUrl(null));
    }
    // Mount-only: dependencies are stable for the life of this form instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase === 'sendingOtp' || phase === 'verifying' || phase === 'redirecting';

  // When the reserved review address is entered, swap the OTP step for a password
  // field. Invisible to everyone else — no other email matches.
  const passwordMode = isPasswordLoginEmail(email);

  // The OTP code-entry step is never shown in password mode: the shared
  // 'verifying'/'redirecting' phases there belong to the password sign-in, which
  // stays on the email step throughout.
  const onCodeStep =
    !passwordMode &&
    (phase === 'awaitingOtp' || phase === 'verifying' || phase === 'redirecting');

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

  // The reserved review account signs in with its password. Supabase sets the
  // same session cookies as an OTP verify, so the app-session mint below is
  // identical to verifyOtp — only the credential step differs.
  const signInWithPassword = useCallback(async () => {
    if (!password.trim() || !email.trim()) return;
    setError(null);
    setPhase('verifying');
    try {
      const { createSupabaseBrowserClient } = await import('@/features/auth/supabase/browser');
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setPhase('idle');
        return;
      }
      setPhase('redirecting');
      const res = await apiFetch('/api/auth/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
        body: JSON.stringify({ deviceId: getDeviceId() }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setError(t('auth.errorAccountLoad'));
        setPhase('idle');
        return;
      }
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorVerifyCode'));
      setPhase('idle');
    }
  }, [email, password, nextPath, router, t]);

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
      // Persist the email (for verify + display) and move to the code step.
      // Write the URL SYNCHRONOUSLY, before changing the UI: Firefox-Android may
      // discard the tab the instant the user switches away to fetch the code, and
      // it restores whatever URL was committed. `router.replace` is async and can
      // lose that race; `history.replaceState` (supported by the App Router)
      // commits `/login?step=code` immediately, with no reload — so the Supabase
      // client stays alive for verify and a restore lands on the code step.
      writePendingOtp(email.trim());
      window.history.replaceState(null, '', buildLoginUrl('code'));
      setPhase('awaitingOtp');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorSendCode'));
      setPhase('idle');
    }
  }, [buildLoginUrl, email, t]);

  const verifyOtp = useCallback(async () => {
    if (!otp.trim()) return;
    if (!email.trim()) {
      setError(t('auth.errorSendCode'));
      return;
    }
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
      const res = await apiFetch('/api/auth/sync-user', {
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
      // Signed in — the pending record has served its purpose.
      clearPendingOtp();
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
    <div className="w-full max-w-md rounded-[28px] border-2 border-ink bg-paper/95 p-6 text-ink backdrop-blur-sm sm:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo size={72} />
          <div className="space-y-2">
            <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-soft">
              {t('auth.brand')}
            </p>
            <h1 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-ink">
              {t('auth.signInTitle')}
            </h1>
            <p className="m-0 text-sm leading-6 text-ink-soft">
              {t('auth.signInSubtitle')}
            </p>
          </div>
        </div>

        {!configured ? (
          <p className="m-0 rounded-2xl border border-brick/20 bg-brick/8 px-4 py-3 text-sm text-[#8A1C1C]">
            {t('auth.notConfigured')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {!onCodeStep ? (
              <>
                <button
                  type="button"
                  onClick={() => void startGoogle()}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-paper-hi px-5 py-3 text-base font-semibold text-ink transition-colors hover:bg-[#FBEFD0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon />
                  {t('auth.continueWithGoogle')}
                </button>

                <div className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
                  <span className="h-px flex-1 bg-ink/15" />
                  {t('auth.or')}
                  <span className="h-px flex-1 bg-ink/15" />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (passwordMode) {
                      void signInWithPassword();
                    } else {
                      void sendOtp();
                    }
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
                    className="min-h-12 rounded-2xl border-2 border-ink/30 bg-paper-hi px-4 py-3 text-base text-ink outline-none focus:border-sea"
                  />
                  {passwordMode ? (
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      className="min-h-12 rounded-2xl border-2 border-ink/30 bg-paper-hi px-4 py-3 text-base text-ink outline-none focus:border-sea"
                    />
                  ) : null}
                  <button
                    type="submit"
                    disabled={
                      passwordMode
                        ? busy || !password.trim()
                        : busy || !email.trim()
                    }
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-sea bg-sea px-5 py-3 text-base font-semibold text-paper hover:bg-sea-600 hover:border-sea-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passwordMode
                      ? phase === 'verifying' || phase === 'redirecting'
                        ? 'Signing in…'
                        : 'Sign in'
                      : phase === 'sendingOtp'
                        ? t('auth.sendingCode')
                        : t('auth.emailMeCode')}
                  </button>
                </form>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyOtp();
                }}
                className="flex flex-col gap-2"
              >
                {email.trim() ? (
                  <p className="m-0 text-sm text-ink-soft">
                    {t('auth.enterCodeSentTo', { email: email.trim() })}
                  </p>
                ) : null}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="12345678"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={phase === 'verifying' || phase === 'redirecting'}
                  className="min-h-12 rounded-2xl border-2 border-ink/30 bg-paper-hi px-4 py-3 text-center text-lg tracking-[0.4em] text-ink outline-none focus:border-sea"
                />
                <button
                  type="submit"
                  disabled={busy || !otp.trim()}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-sea bg-sea px-5 py-3 text-base font-semibold text-paper hover:bg-sea-600 hover:border-sea-600 disabled:cursor-not-allowed disabled:opacity-60"
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
                    clearPendingOtp();
                    // Drop `step=code` synchronously (same reasoning as sendOtp)
                    // so a later restore doesn't bounce back to an abandoned code
                    // screen.
                    window.history.replaceState(null, '', buildLoginUrl(null));
                    setEmail('');
                    setOtp('');
                    setError(null);
                    setPhase('idle');
                  }}
                  className="text-sm text-ink-soft underline underline-offset-2"
                >
                  {t('auth.useDifferentEmail')}
                </button>
              </form>
            )}
          </div>
        )}

        {displayError ? (
          <p
            className="m-0 select-text whitespace-pre-wrap break-words rounded-2xl border border-brick/20 bg-brick/8 px-4 py-3 text-sm text-[#8A1C1C]"
            role="alert"
          >
            {displayError}
          </p>
        ) : null}

        <p className="m-0 text-center text-xs text-ink-soft">
          {legalParts.map((part, i) => {
            if (part === '{terms}') {
              return (
                <a
                  key={i}
                  href="/terms"
                  className="underline underline-offset-2 hover:text-ink"
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
                  className="underline underline-offset-2 hover:text-ink"
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
