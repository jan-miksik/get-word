'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthConnectCard } from '@/components/AuthConnectCard';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { useAuth } from '@/hooks/useAuth';
import { linkWalletWithRetry } from '@/lib/sync';

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
  const [linkRetryNonce, setLinkRetryNonce] = useState(0);
  const linkedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (linkedAddressRef.current === address) return;
    linkedAddressRef.current = address;
    setIsLinking(true);
    setError(null);
    void linkWalletWithRetry(address, {
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
  }, [isConnected, address, email, authProvider, linkRetryNonce, nextPath, router]);

  const handleSignIn = useCallback(() => {
    if (isConnected && address && error) {
      linkedAddressRef.current = null;
      setError(null);
      setLinkRetryNonce((nonce) => nonce + 1);
      return;
    }
    signIn();
  }, [address, error, isConnected, signIn]);

  return (
    <main className="app bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
      <SpeckledBackground />
      <div className="flex flex-1 items-center justify-center">
        <AuthConnectCard
          brand="Get Word"
          title="Sign in"
          description="Continue with email, Google, Apple or crypto wallet"
          buttonLabel="Continue"
          isBusy={isLinking}
          error={error}
          onSignIn={handleSignIn}
        />
      </div>
    </main>
  );
}
