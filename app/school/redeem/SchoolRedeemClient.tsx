'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';

const STORED_CODE_KEY = 'get-word-school-redeem-code';

type RedeemState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'success'; schoolName: string; role: string }
  | { status: 'error'; message: string | null };

function readCodeFromHashOrStorage() {
  if (typeof window === 'undefined') return '';
  const hashCode = window.location.hash.startsWith('#')
    ? decodeURIComponent(window.location.hash.slice(1)).trim()
    : '';
  if (hashCode) {
    window.sessionStorage.setItem(STORED_CODE_KEY, hashCode);
    window.history.replaceState(null, '', '/school/redeem');
    return hashCode;
  }
  return window.sessionStorage.getItem(STORED_CODE_KEY)?.trim() ?? '';
}

function clearStoredCode() {
  try {
    window.sessionStorage.removeItem(STORED_CODE_KEY);
  } catch {
    // Best effort only.
  }
}

export function SchoolRedeemClient() {
  const settingsLanguage = useSettingsLanguage();
  return (
    <I18nProvider language={settingsLanguage}>
      <SchoolRedeemContent />
    </I18nProvider>
  );
}

function SchoolRedeemContent() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<RedeemState>({ status: 'loading' });

  useEffect(() => {
    const code = readCodeFromHashOrStorage();
    if (!code) {
      queueMicrotask(() => setState({ status: 'missing' }));
      return;
    }

    let cancelled = false;
    fetch('/api/schools/redeem', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.status === 401) {
          window.sessionStorage.setItem(STORED_CODE_KEY, code);
          router.replace(`/login?next=${encodeURIComponent('/school/redeem')}`);
          return;
        }
        if (!response.ok) {
          // A code the server rejected keeps failing, so drop it instead of
          // silently retrying it on every later visit to this page.
          clearStoredCode();
          setState({
            status: 'error',
            message: typeof data.error === 'string' ? data.error : null,
          });
          return;
        }
        clearStoredCode();
        setState({
          status: 'success',
          schoolName: String(data.school_name ?? ''),
          role: String(data.role ?? 'student'),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', message: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-dvh bg-[#F4EFE2] px-5 py-10 text-[#2A2218]">
      <div className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center text-center">
        <AppLogo size={76} />
        <div className="mt-7 w-full rounded-2xl border border-[#2A2218]/15 bg-white/70 p-6 shadow-[0_18px_50px_rgba(42,34,24,0.12)]">
          {state.status === 'loading' && (
            <>
              <h1 className="m-0 text-xl font-semibold">{t('school.activatingTitle')}</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">{t('school.activatingBody')}</p>
            </>
          )}
          {state.status === 'missing' && (
            <>
              <h1 className="m-0 text-xl font-semibold">{t('school.missingTitle')}</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">{t('school.missingBody')}</p>
            </>
          )}
          {state.status === 'success' && (
            <>
              <h1 className="m-0 text-xl font-semibold">{t('school.successTitle')}</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">
                {t(
                  state.role === 'teacher' ? 'school.successTeacher' : 'school.successStudent',
                  { school: state.schoolName },
                )}
              </p>
              <button
                type="button"
                className="mt-5 rounded-xl bg-[#1E6FA8] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => router.push('/lists')}
              >
                {t('school.continue')}
              </button>
            </>
          )}
          {state.status === 'error' && (
            <>
              <h1 className="m-0 text-xl font-semibold">{t('school.errorTitle')}</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">
                {state.message ?? t('school.errorBody')}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
