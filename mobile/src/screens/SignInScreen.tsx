import { apiOrigin, hasMobileAuthConfiguration } from '../config';
import { isNativeApp } from '../native';

type SignInScreenProps = {
  busy: boolean;
  busyLabel: string;
  connection: 'online' | 'offline';
  error: string | null;
  onSignIn: () => void;
};

export function SignInScreen({
  busy,
  busyLabel,
  connection,
  error,
  onSignIn,
}: SignInScreenProps) {
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
          disabled={busy || !hasMobileAuthConfiguration() || !isNativeApp()}
          onClick={onSignIn}
        >
          <span className="apple-mark" aria-hidden="true"></span>
          {busy ? busyLabel : 'Pokračovat přes Apple'}
        </button>

        {!hasMobileAuthConfiguration() ? (
          <p className="setup-note">
            Chybí veřejné nastavení Supabase pro mobilní build.
          </p>
        ) : null}
      </section>
    </main>
  );
}
