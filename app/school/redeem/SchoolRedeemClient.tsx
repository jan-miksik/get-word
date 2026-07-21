'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';

const STORED_CODE_KEY = 'get-word-school-redeem-code';

type RedeemState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'success'; schoolName: string; role: string }
  | { status: 'error'; message: string };

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
          setState({
            status: 'error',
            message: typeof data.error === 'string'
              ? data.error
              : 'This school access link is not available.',
          });
          return;
        }
        clearStoredCode();
        setState({
          status: 'success',
          schoolName: String(data.school_name ?? 'your school'),
          role: String(data.role ?? 'student'),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', message: 'Could not redeem this school access link.' });
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
              <h1 className="m-0 text-xl font-semibold">Activating school access</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">Checking your account and school seat...</p>
            </>
          )}
          {state.status === 'missing' && (
            <>
              <h1 className="m-0 text-xl font-semibold">School code missing</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">Open the full link from your school again.</p>
            </>
          )}
          {state.status === 'success' && (
            <>
              <h1 className="m-0 text-xl font-semibold">School access is active</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">
                You joined {state.schoolName} as {state.role}.
              </p>
              <button
                type="button"
                className="mt-5 rounded-xl bg-[#1E6FA8] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => router.push('/lists')}
              >
                Continue
              </button>
            </>
          )}
          {state.status === 'error' && (
            <>
              <h1 className="m-0 text-xl font-semibold">School access unavailable</h1>
              <p className="mt-3 text-sm text-[#6B5E48]">{state.message}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
