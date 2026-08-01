import { App as CapacitorApp } from '@capacitor/app';
import { lazy, Suspense, useEffect, useState } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { fetchMobileIdentity } from './api/auth';
import { signInWithApple } from './auth/apple';
import {
  clearAppSessionToken,
  readAppSessionToken,
} from './auth/secure-session';
import { setSessionToken } from './auth/session-state';
import { routeForAppUrl } from './deep-links';
import { isNativeApp, setNativeStatusBarStyle, tapFeedback } from './native';
import { getRoutePath, navigate, subscribeToRoute, useRoutePath } from './router';
import { LearningApp } from './screens/LearningApp';
import { SignInScreen } from './screens/SignInScreen';

const ListsPage = lazy(() => import('@/app/lists/page'));
const JoinPage = lazy(() => import('@/app/join/[token]/page'));
const ReportsPage = lazy(() => import('@/app/reports/page'));
const PrivacyPage = lazy(() => import('@/app/privacy/page'));
const SchoolOverviewPage = lazy(() => import('@/app/school/overview/page'));

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
  const routePath = useRoutePath();
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
    const pathname = routePath.split(/[?#]/, 1)[0];
    void setNativeStatusBarStyle(pathname === '/privacy' ? 'light' : 'dark');
  }, [routePath]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let disposed = false;

    const openAppUrl = (url: string, mode: 'push' | 'replace') => {
      const route = routeForAppUrl(url);
      if (route) navigate(route, mode);
    };

    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!disposed) openAppUrl(url, 'push');
    });
    void CapacitorApp.getLaunchUrl()
      .then((launch) => {
        if (!disposed && launch?.url) openAppUrl(launch.url, 'replace');
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove());
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

  const handleAuthenticated = (sessionToken: string) => {
    setAuthError(null);
    setSessionToken(sessionToken);
    setAuthState('signed-in');
  };

  if (authState === 'signed-in') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <NativeRoute routePath={routePath} />
      </Suspense>
    );
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
      onAuthenticated={handleAuthenticated}
    />
  );
}

function NativeRoute({ routePath }: { routePath: string }) {
  const pathname = routePath.split(/[?#]/, 1)[0] || '/';

  if (pathname === '/lists') return <ListsPage />;
  if (/^\/join\/[^/]+\/?$/.test(pathname)) return <JoinPage />;
  if (pathname === '/reports') return <ReportsPage />;
  if (pathname === '/privacy') return <PrivacyPage />;
  if (pathname === '/school/overview') return <SchoolOverviewPage />;
  return <LearningApp />;
}
