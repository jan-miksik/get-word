import { useEffect, useState } from 'react';
import { App as CapacitorApp, type AppState } from '@capacitor/app';
import {
  fetchMobileIdentity,
  type MobileIdentity,
} from './api/auth';
import { signInWithApple } from './auth/apple';
import {
  clearAppSessionToken,
  readAppSessionToken,
} from './auth/secure-session';
import { apiOrigin, hasMobileAuthConfiguration } from './config';
import { isNativeApp, tapFeedback } from './native';

type ConnectionState = 'online' | 'offline';
type ApiState = 'idle' | 'checking' | 'reachable' | 'error';
type AuthState = 'restoring' | 'signed-out' | 'signing-in' | 'signed-in';

function readConnectionState(): ConnectionState {
  return navigator.onLine ? 'online' : 'offline';
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Přihlášení se nepodařilo. Zkus to prosím znovu.';
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>(readConnectionState);
  const [appActive, setAppActive] = useState(true);
  const [apiState, setApiState] = useState<ApiState>('idle');
  const [authState, setAuthState] = useState<AuthState>('restoring');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<MobileIdentity | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const updateConnection = () => setConnection(readConnectionState());
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    let removeAppStateListener: (() => Promise<void>) | undefined;
    if (isNativeApp()) {
      void CapacitorApp.addListener('appStateChange', (state: AppState) => {
        setAppActive(state.isActive);
      }).then((listener) => {
        removeAppStateListener = () => listener.remove();
      });
    }

    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      void removeAppStateListener?.();
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    void (async () => {
      let storedToken: string | null = null;
      try {
        storedToken = await readAppSessionToken();
        if (!storedToken) {
          if (!canceled) setAuthState('signed-out');
          return;
        }

        const restoredIdentity = await fetchMobileIdentity(storedToken);
        if (!restoredIdentity.authenticated) {
          await clearAppSessionToken();
          if (!canceled) setAuthState('signed-out');
          return;
        }

        if (!canceled) {
          setSessionToken(storedToken);
          setIdentity(restoredIdentity);
          setAuthState('signed-in');
        }
      } catch {
        // A cold start without connectivity must not destroy an otherwise
        // valid Keychain session. Keep it and let later authenticated API
        // calls determine whether it has actually expired.
        if (!canceled && storedToken) {
          setSessionToken(storedToken);
          setApiState('error');
          setAuthState('signed-in');
        } else if (!canceled) {
          setAuthState('signed-out');
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  const handleAppleSignIn = async () => {
    await tapFeedback();
    setAuthError(null);
    setAuthState('signing-in');
    try {
      const session = await signInWithApple();
      if (!session) {
        setAuthState('signed-out');
        return;
      }
      setSessionToken(session.sessionToken);
      setIdentity({
        authenticated: true,
        email: session.email,
        authProvider: session.authProvider,
        userRole: session.userRole,
      });
      setAuthState('signed-in');
      setApiState('reachable');
    } catch (error) {
      setAuthError(readableError(error));
      setAuthState('signed-out');
    }
  };

  const handleSignOut = async () => {
    await tapFeedback();
    await clearAppSessionToken();
    setSessionToken(null);
    setIdentity(null);
    setAuthError(null);
    setAuthState('signed-out');
  };

  const handleConnectionCheck = async () => {
    await tapFeedback();
    setApiState('checking');
    try {
      await fetchMobileIdentity(sessionToken);
      setApiState('reachable');
    } catch {
      setApiState('error');
    }
  };

  const isBusy = authState === 'restoring' || authState === 'signing-in';

  return (
    <main className="mobile-shell">
      <div className="pattern" aria-hidden="true" />
      <section className="welcome-card">
        <span className="eyebrow">Get Word for iOS</span>
        <div className="mark" aria-hidden="true">G</div>
        <h1>{authState === 'signed-in' ? 'Vítej v Get Word' : 'Tvoje slovíčka vždy po ruce'}</h1>
        <p>
          {authState === 'signed-in'
            ? 'Apple přihlášení a bezpečná mobilní relace jsou aktivní. Další krok je připojení seznamů a studia.'
            : 'Přihlas se přes Apple. Relace Get Word zůstane bezpečně uložená v iOS Keychain.'}
        </p>

        <dl className="status-list">
          <div>
            <dt>Připojení</dt>
            <dd data-state={connection}>{connection === 'online' ? 'Online' : 'Offline'}</dd>
          </div>
          <div>
            <dt>Účet</dt>
            <dd>
              {authState === 'restoring'
                ? 'Obnovuji…'
                : authState === 'signing-in'
                  ? 'Přihlašuji…'
                  : identity?.email || (authState === 'signed-in' ? 'Přihlášený' : 'Nepřihlášený')}
            </dd>
          </div>
          <div>
            <dt>Server</dt>
            <dd data-state={apiState === 'reachable' ? 'online' : apiState === 'error' ? 'offline' : undefined}>
              {apiState === 'checking'
                ? 'Ověřuji…'
                : apiState === 'reachable'
                  ? 'Dostupný'
                  : apiState === 'error'
                    ? 'Nedostupný'
                    : apiOrigin}
            </dd>
          </div>
          <div>
            <dt>Aplikace</dt>
            <dd>{appActive ? 'Aktivní' : 'Na pozadí'}</dd>
          </div>
        </dl>

        {authError ? <p className="error-message" role="alert">{authError}</p> : null}

        {authState === 'signed-in' ? (
          <div className="action-stack">
            <button type="button" onClick={handleConnectionCheck} disabled={apiState === 'checking'}>
              {apiState === 'checking' ? 'Ověřuji server…' : 'Ověřit spojení'}
            </button>
            <button type="button" className="secondary-button" onClick={handleSignOut}>
              Odhlásit se
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="apple-button"
            disabled={isBusy || !hasMobileAuthConfiguration() || !isNativeApp()}
            onClick={handleAppleSignIn}
          >
            <span className="apple-mark" aria-hidden="true"></span>
            {authState === 'restoring'
              ? 'Obnovuji přihlášení…'
              : authState === 'signing-in'
                ? 'Přihlašuji…'
                : 'Pokračovat přes Apple'}
          </button>
        )}

        {!hasMobileAuthConfiguration() ? (
          <p className="setup-note">Chybí veřejné nastavení Supabase pro mobilní build.</p>
        ) : null}
      </section>
    </main>
  );
}
