import { useState } from 'react';
import { AppLogo } from '@/components/AppLogo';
import { useI18n } from '@/components/I18nProvider';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import {
  isReviewAccountEmail,
  requestEmailSignInCode,
  signInReviewAccountWithPassword,
  signInWithEmailCode,
} from '../auth/email';
import { hasMobileAuthConfiguration } from '../config';
import { isNativeApp } from '../native';
import { navigate } from '../router';

type SignInScreenProps = {
  busy: boolean;
  busyLabel: string;
  error: string | null;
  onSignIn: () => void;
  onAuthenticated: (sessionToken: string) => void;
};

type EmailPhase = 'address' | 'code';

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function SignInScreen({
  busy,
  busyLabel,
  error,
  onSignIn,
  onAuthenticated,
}: SignInScreenProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [emailPhase, setEmailPhase] = useState<EmailPhase>('address');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const authAvailable = hasMobileAuthConfiguration() && isNativeApp();
  const reviewerMode = isReviewAccountEmail(email);
  const disabled = busy || emailBusy || !authAvailable;

  const submitEmail = async () => {
    setEmailError(null);
    setEmailBusy(true);
    try {
      if (emailPhase === 'code') {
        const session = await signInWithEmailCode(email, code);
        onAuthenticated(session.sessionToken);
        return;
      }
      if (reviewerMode) {
        const session = await signInReviewAccountWithPassword(email, password);
        onAuthenticated(session.sessionToken);
        return;
      }
      await requestEmailSignInCode(email);
      setEmailPhase('code');
    } catch (authError) {
      setEmailError(readableError(authError, t('auth.errorSignIn')));
    } finally {
      setEmailBusy(false);
    }
  };
  const legalParts = t('auth.legalNotice').split(/(\{terms\}|\{privacy\})/);

  return (
    <main className="native-sign-in">
      <RisingLettersBackground
        variant="ambient"
        count={48}
        snapToMouse={false}
        className="native-sign-in__letters"
      />
      <section className="native-sign-in__card">
        <header className="native-sign-in__header">
          <AppLogo size={72} className="native-sign-in__logo" />
          <div>
            <p className="native-sign-in__brand">{t('auth.brand')}</p>
            <h1>{t('auth.signInTitle')}</h1>
            <p className="native-sign-in__subtitle">{t('auth.signInSubtitle')}</p>
          </div>
        </header>

        {emailError || error ? (
          <p className="error-message" role="alert">
            {emailError ?? error}
          </p>
        ) : null}

        <button
          type="button"
          className="native-sign-in__apple-button"
          disabled={disabled}
          onClick={onSignIn}
        >
          <span className="native-sign-in__apple-mark" aria-hidden="true"></span>
          {busy ? busyLabel : t('auth.continueWithApple')}
        </button>

        <div className="native-sign-in__divider" aria-hidden="true">
          <span />
          {t('auth.or')}
          <span />
        </div>

        <form
          className="native-sign-in__email-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmail();
          }}
        >
          {emailPhase === 'address' ? (
            <>
              <label>
                <span className="native-sign-in__visually-hidden">{t('auth.emailLabel')}</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    const nextEmail = event.target.value;
                    setEmail(nextEmail);
                    if (!isReviewAccountEmail(nextEmail)) setPassword('');
                    setEmailError(null);
                  }}
                  disabled={busy || emailBusy}
                  required
                />
              </label>
              {reviewerMode ? (
                <label>
                  <span className="native-sign-in__visually-hidden">
                    {t('auth.passwordLabel')}
                  </span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder={t('auth.passwordLabel')}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy || emailBusy}
                    required
                  />
                </label>
              ) : null}
            </>
          ) : (
            <>
              <p className="native-sign-in__code-note">
                {t('auth.enterCodeSentTo', { email: email.trim() })}
              </p>
              <label>
                <span className="native-sign-in__visually-hidden">
                  {t('auth.codeLabel')}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="12345678"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={busy || emailBusy}
                  required
                />
              </label>
              <button
                type="button"
                className="native-sign-in__change-email"
                disabled={busy || emailBusy}
                onClick={() => {
                  setEmailPhase('address');
                  setCode('');
                  setEmailError(null);
                }}
              >
                {t('auth.useDifferentEmail')}
              </button>
            </>
          )}

          <button
            type="submit"
            className="native-sign-in__email-submit"
            disabled={
              disabled ||
              !email.trim() ||
              (emailPhase === 'code' ? !code.trim() : reviewerMode && !password)
            }
          >
            {emailBusy
              ? emailPhase === 'code' || reviewerMode
                ? t('auth.signingIn')
                : t('auth.sendingCode')
              : emailPhase === 'code'
                ? t('auth.verifyAndContinue')
                : reviewerMode
                  ? t('auth.signIn')
                  : t('auth.emailMeCode')}
          </button>
        </form>

        {!hasMobileAuthConfiguration() ? (
          <p className="setup-note">{t('auth.mobileNotConfigured')}</p>
        ) : null}

        <p className="native-sign-in__legal">
          {legalParts.map((part, index) => {
            if (part === '{terms}') {
              return (
                <a
                  key={index}
                  href="/terms"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate('/terms');
                  }}
                >
                  {t('auth.termsOfService')}
                </a>
              );
            }
            if (part === '{privacy}') {
              return (
                <a
                  key={index}
                  href="/privacy"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate('/privacy');
                  }}
                >
                  {t('auth.privacyPolicy')}
                </a>
              );
            }
            return part;
          })}
        </p>
      </section>
    </main>
  );
}
