import { useEffect, useState } from 'react';
import { App as CapacitorApp, type AppState } from '@capacitor/app';
import { fetchMobileIdentity } from './api/auth';
import { apiOrigin } from './config';
import { isNativeApp, tapFeedback } from './native';

type ConnectionState = 'online' | 'offline';
type ApiState = 'idle' | 'checking' | 'reachable' | 'error';

function readConnectionState(): ConnectionState {
  return navigator.onLine ? 'online' : 'offline';
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>(readConnectionState);
  const [appActive, setAppActive] = useState(true);
  const [apiState, setApiState] = useState<ApiState>('idle');

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

  return (
    <main className="mobile-shell">
      <div className="pattern" aria-hidden="true" />
      <section className="welcome-card">
        <span className="eyebrow">Get Word for iOS</span>
        <div className="mark" aria-hidden="true">
          G
        </div>
        <h1>Mobilní základ je připravený</h1>
        <p>
          Tato obrazovka je součástí aplikace a funguje bez načítání webu. V
          dalších krocích sem připojíme přihlášení, synchronizaci slovíček a
          studijní obrazovku.
        </p>

        <dl className="status-list">
          <div>
            <dt>Prostředí</dt>
            <dd>{isNativeApp() ? 'iOS / Capacitor' : 'Webový náhled'}</dd>
          </div>
          <div>
            <dt>Připojení</dt>
            <dd data-state={connection}>{connection === 'online' ? 'Online' : 'Offline'}</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>{apiOrigin}</dd>
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
                    : 'Neověřený'}
            </dd>
          </div>
          <div>
            <dt>Aplikace</dt>
            <dd>{appActive ? 'Aktivní' : 'Na pozadí'}</dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={apiState === 'checking'}
          onClick={async () => {
            await tapFeedback();
            setApiState('checking');
            try {
              await fetchMobileIdentity();
              setApiState('reachable');
            } catch {
              setApiState('error');
            }
          }}
        >
          {apiState === 'checking' ? 'Ověřuji server…' : 'Ověřit spojení a haptiku'}
        </button>
      </section>
    </main>
  );
}
