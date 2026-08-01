import { useState } from 'react';
import { apiOrigin, hasMobileAuthConfiguration } from '../config';
import { isNativeApp } from '../native';

type SignInScreenProps = {
  busy: boolean;
  busyLabel: string;
  connection: 'online' | 'offline';
  error: string | null;
  onSignIn: () => void;
  onReviewerSignIn: (email: string, password: string) => void;
};

export function SignInScreen({
  busy,
  busyLabel,
  connection,
  error,
  onSignIn,
  onReviewerSignIn,
}: SignInScreenProps) {
  const [showReviewerLogin, setShowReviewerLogin] = useState(false);
  const [reviewEmail, setReviewEmail] = useState('');
  const [reviewPassword, setReviewPassword] = useState('');
  const authAvailable = hasMobileAuthConfiguration() && isNativeApp();

  return (
    <main className="mobile-shell">
      <div className="pattern" aria-hidden="true" />
      <section className="welcome-card">
        <span className="eyebrow">Get Word for iOS</span>
        <div className="mark" aria-hidden="true">G</div>
        <h1>Tvoje slovíčka vždy po ruce</h1>
        <p>
          Přihlas se přes Apple. Relace Get Word zůstane bezpečně uložená v iOS
          Keychain.
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

        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="apple-button"
          disabled={busy || !authAvailable}
          onClick={onSignIn}
        >
          <span className="apple-mark" aria-hidden="true"></span>
          {busy ? busyLabel : 'Pokračovat přes Apple'}
        </button>

        <button
          type="button"
          className="review-login-toggle"
          aria-expanded={showReviewerLogin}
          onClick={() => setShowReviewerLogin((visible) => !visible)}
          disabled={busy}
        >
          App Review login
        </button>

        {showReviewerLogin ? (
          <form
            className="review-login-form"
            onSubmit={(event) => {
              event.preventDefault();
              onReviewerSignIn(reviewEmail, reviewPassword);
            }}
          >
            <label>
              Review email
              <input
                type="email"
                inputMode="email"
                autoComplete="username"
                value={reviewEmail}
                onChange={(event) => setReviewEmail(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label>
              Review password
              <input
                type="password"
                autoComplete="current-password"
                value={reviewPassword}
                onChange={(event) => setReviewPassword(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <button
              type="submit"
              className="review-login-submit"
              disabled={busy || !authAvailable || !reviewEmail.trim() || !reviewPassword}
            >
              {busy ? busyLabel : 'Sign in for App Review'}
            </button>
          </form>
        ) : null}

        {!hasMobileAuthConfiguration() ? (
          <p className="setup-note">
            Chybí veřejné nastavení Supabase pro mobilní build.
          </p>
        ) : null}
      </section>
    </main>
  );
}
