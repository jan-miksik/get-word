import { useEffect, useState } from 'react';
import { fetchMobileIdentity } from './api/auth';
import { signInWithApple } from './auth/apple';
import {
  clearAppSessionToken,
  readAppSessionToken,
} from './auth/secure-session';
import { setSessionToken } from './auth/session-state';
import { isNativeApp, tapFeedback } from './native';
import { getRoutePath, navigate, subscribeToRoute } from './router';
import { LearningApp } from './screens/LearningApp';
import { SignInScreen } from './screens/SignInScreen';

type ConnectionState = 'online' | 'offline';
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
  const [authState, setAuthState] = useState<AuthState>('restoring');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const updateConnection = () => setConnection(readConnectionState());
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
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
        setSessionToken(storedToken);

        const restoredIdentity = await fetchMobileIdentity(storedToken);
        if (!restoredIdentity.authenticated) {
          await clearAppSessionToken();
          setSessionToken(null);
          if (!canceled) setAuthState('signed-out');
          return;
        }

        if (!canceled) setAuthState('signed-in');
      } catch {
        // A cold start without connectivity must not destroy an otherwise
        // valid Keychain session. Keep it and let later authenticated API
        // calls determine whether it has actually expired.
        if (!canceled) setAuthState(storedToken ? 'signed-in' : 'signed-out');
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  // The shared app signs out by routing to `/login`, a page this bundle does
  // not have. Treat arriving there as "the session is gone" and fall back to
  // the native sign-in screen.
  useEffect(
    () =>
      subscribeToRoute(() => {
        if (!getRoutePath().startsWith('/login')) return;
        void clearAppSessionToken();
        setSessionToken(null);
        setAuthState('signed-out');
        navigate('/', 'replace');
      }),
    [],
  );

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
      setAuthState('signed-in');
    } catch (error) {
      setAuthError(readableError(error));
      setAuthState('signed-out');
    }
  };

  if (authState === 'signed-in') {
    return <LearningApp />;
  }

  return (
    <SignInScreen
      busy={authState === 'restoring' || authState === 'signing-in'}
      busyLabel={authState === 'restoring' ? 'Obnovuji přihlášení…' : 'Přihlašuji…'}
      connection={connection}
      error={authError}
      onSignIn={() => {
        if (!isNativeApp()) return;
        void handleAppleSignIn();
      }}
    />
  );
}
