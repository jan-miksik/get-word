import { App as CapacitorApp } from '@capacitor/app';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { LoadingScreen } from '@/components/LoadingScreen';
import { configureSignOutHandler } from '@/features/auth/client/sign-out-runtime';
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
const TermsPage = lazy(() => import('@/app/terms/page'));
const SchoolOverviewPage = lazy(() => import('@/app/school/overview/page'));

type AuthState = 'restoring' | 'signed-out' | 'signing-in' | 'signed-in';

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Přihlášení se nepodařilo. Zkus to prosím znovu.';
}

export function App() {
  const { t } = useI18n();
  const routePath = useRoutePath();
  const [authState, setAuthState] = useState<AuthState>('restoring');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const pathname = routePath.split(/[?#]/, 1)[0];
    void setNativeStatusBarStyle(
      pathname === '/privacy' || pathname === '/terms' ? 'light' : 'dark',
    );
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

  // Sign-out has to end here, not in a page reload: the shared web path clears
  // a cookie, while this client's session is the Keychain token. Without this
  // the reload would find that token and sign the account straight back in.
  useEffect(() => {
    configureSignOutHandler(async () => {
      await clearAppSessionToken();
      setSessionToken(null);
      setAuthError(null);
      setAuthState('signed-out');
      navigate('/', 'replace');
    });
    return () => configureSignOutHandler(null);
  }, []);

  // The shared app also reaches the account page by routing to `/login`, which
  // this bundle does not have. Treat arriving there as "the session is gone"
  // and fall back to the native sign-in screen.
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

  const pathname = routePath.split(/[?#]/, 1)[0] || '/';

  // Legal documents must remain reachable from the sign-in screen without an
  // account. Their back link returns to `/`, where this auth gate resumes.
  if (pathname === '/privacy' || pathname === '/terms') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <NativeRoute routePath={routePath} />
      </Suspense>
    );
  }

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
      busyLabel={authState === 'restoring' ? t('app.loading') : t('auth.signingIn')}
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
  if (pathname === '/terms') return <TermsPage />;
  if (pathname === '/school/overview') return <SchoolOverviewPage />;
  return <LearningApp />;
}
