'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import type { I18nKey } from '@/lib/i18n/locales/en';

const STORED_CODE_KEY = 'get-word-school-redeem-code';

type RedeemState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'success'; schoolName: string; role: string }
  | { status: 'signInRequired' }
  | { status: 'error'; messageKey: I18nKey | null };

/**
 * Codes that can never succeed on a retry. Everything else is recoverable —
 * the account still has to link an email, a teacher can free up a seat, an
 * operator can reactivate the school — so the code stays in session storage
 * for the next attempt. It has to: the URL fragment carrying it was stripped
 * on arrival, and the student has no other copy of it.
 */
const TERMINAL_REDEEM_CODES = new Set(['INVALID_SCHOOL_CODE', 'SCHOOL_CODE_EXPIRED']);

/**
 * Server error messages are English and meant for operators. Students see a
 * localized explanation of what to do next instead.
 */
const REDEEM_ERROR_MESSAGE_KEYS: Record<string, I18nKey> = {
  INVALID_SCHOOL_CODE: 'school.errorInvalidCode',
  SCHOOL_CODE_EXPIRED: 'school.errorCodeExpired',
  SCHOOL_INACTIVE: 'school.errorSchoolInactive',
  SCHOOL_PILOT_EXPIRED: 'school.errorPilotExpired',
  SCHOOL_SEATS_FULL: 'school.errorSeatsFull',
  SCHOOL_TEACHERS_FULL: 'school.errorTeachersFull',
  SCHOOL_MEMBERSHIP_ALREADY_EXISTS: 'school.errorAlreadyMember',
};

function redeemMessageKey(code: unknown): I18nKey | null {
  return typeof code === 'string' ? REDEEM_ERROR_MESSAGE_KEYS[code] ?? null : null;
}

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
          if (data.code === 'LINKED_ACCOUNT_REQUIRED') {
            // Signed in by device only. The code survives the sign-in round
            // trip, so returning here re-runs the redeem automatically.
            setState({ status: 'signInRequired' });
            return;
          }
          if (TERMINAL_REDEEM_CODES.has(String(data.code))) {
            clearStoredCode();
          }
          setState({ status: 'error', messageKey: redeemMessageKey(data.code) });
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
          setState({ status: 'error', messageKey: null });
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
          {state.status === 'signInRequired' && (
            <>
              <h1 className="m-0 text-xl font-semibold">{t('school.signInTitle')}</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">{t('school.signInBody')}</p>
              <button
                type="button"
                className="mt-5 rounded-xl bg-[#1E6FA8] px-4 py-2 text-sm font-semibold text-white"
                onClick={() =>
                  router.push(`/login?next=${encodeURIComponent('/school/redeem')}`)
                }
              >
                {t('school.signIn')}
              </button>
            </>
          )}
          {state.status === 'error' && (
            <>
              <h1 className="m-0 text-xl font-semibold">{t('school.errorTitle')}</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">
                {t(state.messageKey ?? 'school.errorBody')}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
