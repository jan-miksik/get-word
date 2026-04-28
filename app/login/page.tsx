'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLogo } from '@/components/AppLogo';
import { useAuth } from '@/hooks/useAuth';
import { linkWallet } from '@/lib/sync';

function sanitizeNextPath(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next')),
    [searchParams]
  );

  const { isConnected, address, email, authProvider, signIn } = useAuth();
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (linkedAddressRef.current === address) return;
    linkedAddressRef.current = address;
    setIsLinking(true);
    setError(null);
    void linkWallet(address, {
      email: email ?? null,
      authProvider: authProvider ?? null,
    })
      .then(() => {
        router.replace(nextPath);
      })
      .catch((err) => {
        linkedAddressRef.current = null;
        setError(err instanceof Error ? err.message : 'Failed to sign in');
      })
      .finally(() => {
        setIsLinking(false);
      });
  }, [isConnected, address, email, authProvider, nextPath, router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-background-elevated p-7 flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppLogo size={72} />
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-text-soft opacity-80">
              Get Word
            </p>
            <h1 className="m-0 text-2xl font-semibold text-text">Sign in</h1>
          </div>
        </div>
        <p className="m-0 text-sm text-text-soft">
          Sign in with email, Google, or Apple to access Get Word and continue your learning progress across devices.
        </p>

        <button
          type="button"
          onClick={signIn}
          disabled={isLinking}
          className="auth-button auth-button--large"
        >
          {isLinking ? 'Signing in…' : 'Sign in'}
        </button>

        {error && (
          <p className="m-0 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
