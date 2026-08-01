import { useState } from 'react';
import {
  isReviewAccountEmail,
  requestEmailSignInCode,
  signInReviewAccountWithPassword,
  signInWithEmailCode,
} from '../auth/email';
import { apiOrigin, hasMobileAuthConfiguration } from '../config';
import { isNativeApp } from '../native';

type SignInScreenProps = {
  busy: boolean;
  busyLabel: string;
  connection: 'online' | 'offline';
  error: string | null;
  onSignIn: () => void;
  onAuthenticated: (sessionToken: string) => void;
};

type EmailPhase = 'address' | 'code';

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Přihlášení se nepodařilo. Zkus to prosím znovu.';
}

export function SignInScreen({
  busy,
  busyLabel,
  connection,
  error,
  onSignIn,
  onAuthenticated,
}: SignInScreenProps) {
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
      setEmailError(readableError(authError));
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <main className="mobile-shell">
      <div className="pattern" aria-hidden="true" />
      <section className="welcome-card">
        <span className="eyebrow">Get Word for iOS</span>
        <div className="mark" aria-hidden="true">G</div>
        <h1>Tvoje slovíčka vždy po ruce</h1>
        <p>
          Přihlas se přes Apple nebo e-mailem. Relace Get Word zůstane bezpečně
          uložená v iOS Keychain.
        </p>

        <dl className="status-list">
          <div>
            <dt>Připojení</dt>
            <dd data-state={connection}>
              {connection === 'online' ? 'Online' : 'Offline'}
            </dd>
          </div>
          <div>
            <dt>Server</dt>
            <dd>{apiOrigin}</dd>
          </div>
        </dl>

        {emailError || error ? (
          <p className="error-message" role="alert">
            {emailError ?? error}
          </p>
        ) : null}

        <button
          type="button"
          className="apple-button"
          disabled={disabled}
          onClick={onSignIn}
        >
          <span className="apple-mark" aria-hidden="true"></span>
          {busy ? busyLabel : 'Pokračovat přes Apple'}
        </button>

        <div className="sign-in-divider" aria-hidden="true">
          <span />
          nebo
          <span />
        </div>

        <form
          className="email-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmail();
          }}
        >
          {emailPhase === 'address' ? (
            <>
              <label>
                E-mail
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
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
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
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
              <p className="email-code-note">Kód jsme poslali na {email.trim()}.</p>
            <label>
              Přihlašovací kód
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={busy || emailBusy}
                required
              />
            </label>
            <button
              type="button"
              className="change-email-button"
              disabled={busy || emailBusy}
              onClick={() => {
                setEmailPhase('address');
                setCode('');
                setEmailError(null);
              }}
            >
              Použít jiný e-mail
            </button>
            </>
          )}

          <button
            type="submit"
            className="email-login-submit"
            disabled={
              disabled ||
              !email.trim() ||
              (emailPhase === 'code' ? !code.trim() : reviewerMode && !password)
            }
          >
            {emailBusy
              ? emailPhase === 'code' || reviewerMode
                ? 'Přihlašuji…'
                : 'Odesílám kód…'
              : emailPhase === 'code'
                ? 'Ověřit kód'
                : reviewerMode
                  ? 'Přihlásit se'
                  : 'Poslat přihlašovací kód'}
          </button>
        </form>

        {!hasMobileAuthConfiguration() ? (
          <p className="setup-note">
            Chybí veřejné nastavení Supabase pro mobilní build.
          </p>
        ) : null}
      </section>
    </main>
  );
}
