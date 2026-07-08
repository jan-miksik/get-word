'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { useListsSettingsLanguage } from '@/features/lists/hooks/useListsSettingsLanguage';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import { persistActiveListId } from '@/features/learning/app-state/storage';

type SharePreview = {
  listId: string;
  name: string;
  languageFrom: string;
  languageTo: string;
  isPublic: boolean;
  isOwner: boolean;
  alreadySubscribed: boolean;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; preview: SharePreview };

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; canAutoAcceptShare: boolean };

type AuthMeResponse = {
  authenticated?: boolean;
  languageFrom?: string | null;
  languageTo?: string | null;
  onboardingCompletedAt?: string | null;
};

function readAutoJoinRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('auto') === '1';
}

function isUninitializedAccount(data: AuthMeResponse): boolean {
  return !data.onboardingCompletedAt && !data.languageFrom && !data.languageTo;
}

function shouldAutoAcceptShare(authState: AuthState, autoRequested: boolean): boolean {
  if (authState.status !== 'signedIn') return false;
  return autoRequested && authState.canAutoAcceptShare;
}

export default function JoinPage() {
  const settingsLanguage = useListsSettingsLanguage();
  return (
    <I18nProvider language={settingsLanguage}>
      <JoinContent />
    </I18nProvider>
  );
}

function JoinContent() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';

  const [state, setState] = useState<LoadState>(() =>
    token ? { status: 'loading' } : { status: 'invalid' }
  );
  const [busy, setBusy] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });
  const [autoJoinFailed, setAutoJoinFailed] = useState(false);
  const autoJoinAttemptedRef = useRef(false);
  const autoRequested = useMemo(() => readAutoJoinRequested(), []);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    void deviceJsonFetch(`/api/lists/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: 'invalid' });
          return;
        }
        const preview = (await res.json()) as SharePreview;
        // Owner opening their own link — nothing to add, just go home.
        if (preview.isOwner) {
          router.replace('/');
          return;
        }
        setState({ status: 'ready', preview });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'invalid' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data: AuthMeResponse) => {
        if (cancelled) return;
        if (!data.authenticated) {
          setAuthState({ status: 'signedOut' });
          return;
        }
        setAuthState({
          status: 'signedIn',
          canAutoAcceptShare: isUninitializedAccount(data),
        });
      })
      .catch(() => {
        if (!cancelled) setAuthState({ status: 'signedOut' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (opts?: { activate?: boolean }): Promise<string | null> => {
    const res = await deviceJsonFetch(`/api/lists/share/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ activate: opts?.activate === true }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { listId: string };
    return data.listId;
  }, [token]);

  const handleAddAndSwitch = useCallback(async () => {
    setBusy(true);
    const listId = await subscribe({ activate: true });
    if (listId) {
      persistActiveListId(listId);
      router.push('/');
    } else {
      setBusy(false);
    }
  }, [subscribe, router]);

  useEffect(() => {
    if (state.status !== 'ready' || autoJoinFailed || busy) return;

    if (authState.status === 'signedOut') {
      router.replace(`/login?next=${encodeURIComponent(`/join/${encodeURIComponent(token)}?auto=1`)}`);
      return;
    }

    if (!shouldAutoAcceptShare(authState, autoRequested)) return;
    if (autoJoinAttemptedRef.current) return;
    autoJoinAttemptedRef.current = true;

    setBusy(true);
    void subscribe({ activate: true }).then((listId) => {
      if (listId) {
        persistActiveListId(listId);
        router.replace('/');
        return;
      }
      setAutoJoinFailed(true);
      setBusy(false);
      autoJoinAttemptedRef.current = false;
    });
  }, [authState, autoJoinFailed, autoRequested, busy, router, state, subscribe, token]);

  const handleAddForLater = useCallback(async () => {
    setBusy(true);
    const listId = await subscribe({ activate: false });
    if (listId) {
      router.push('/lists');
    } else {
      setBusy(false);
    }
  }, [subscribe, router]);

  const handleNotNow = useCallback(() => {
    router.push('/');
  }, [router]);

  if (state.status === 'loading') {
    return <LoadingScreen />;
  }

  if (state.status === 'invalid') {
    return (
      <CenteredScreen>
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold text-[#2A2218]">{t('join.invalidTitle')}</h1>
          <p className="mt-2 text-sm text-[#6B5E48]">{t('join.invalidBody')}</p>
          <button
            type="button"
            className="mt-5 rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-4 py-2 text-sm font-semibold text-[#F4EFE2] transition-colors hover:border-[#155987] hover:bg-[#155987]"
            onClick={() => router.push('/lists')}
          >
            {t('join.goToLists')}
          </button>
        </div>
      </CenteredScreen>
    );
  }

  const { preview } = state;
  const isAutoJoining = !autoJoinFailed && shouldAutoAcceptShare(authState, autoRequested);

  if (authState.status === 'loading' || authState.status === 'signedOut' || isAutoJoining) {
    return <LoadingScreen />;
  }

  return (
    <CenteredScreen>
      <div className="w-full max-w-md rounded-[36px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 px-7 py-8 text-[#2A2218] shadow-[0_18px_50px_rgba(42,34,24,0.18)] backdrop-blur-sm sm:px-9 sm:py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo size={72} />
          <div className="space-y-2">
            <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
              {t('auth.brand')}
            </p>
            <h1 className="m-0 text-2xl font-semibold leading-tight text-[#2A2218]">
              {t('join.prompt', { name: preview.name })}
            </h1>
            <p className="m-0 text-sm font-semibold text-[#6B5E48]">
              {preview.languageFrom} → {preview.languageTo}
            </p>
          </div>
        </div>

        {!preview.isPublic && (
          <p className="mx-auto mt-5 flex max-w-[21rem] items-start justify-center gap-2 rounded-2xl border border-[#2A2218]/15 bg-[#FFF8E8] px-3 py-2.5 text-center text-sm text-[#6B5E48]">
            <span aria-hidden>🔒</span>
            <span>{t('join.privateNotice')}</span>
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#7CA7C5] bg-[#7CA7C5] px-5 py-3 text-base font-semibold text-[#F4EFE2] transition-colors hover:border-[#1E6FA8] hover:bg-[#1E6FA8] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAddAndSwitch}
          >
            {busy ? t('join.adding') : t('join.addAndSwitch')}
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#2A2218] bg-transparent px-5 py-3 text-base font-semibold text-[#2A2218] transition-colors hover:bg-[#2A2218]/5 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAddForLater}
          >
            {t('join.addForLater')}
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold text-[#6B5E48] transition-colors hover:bg-[#2A2218]/5 hover:text-[#2A2218] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleNotNow}
          >
            {t('join.notNow')}
          </button>
        </div>
      </div>
    </CenteredScreen>
  );
}

function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <main className="app relative flex min-h-screen items-center justify-center overflow-hidden bg-[#dcd1b9] p-4 text-[#2A2218]">
      <SpeckledBackground />
      {children}
    </main>
  );
}
