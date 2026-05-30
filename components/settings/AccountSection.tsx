'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { AddressWithCopy } from './primitives';
import { copyTextToClipboard } from './format';

export function AccountSection({
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
}: {
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { userId, userWalletAddress, userEmail } = useAppStateContext();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await copyTextToClipboard(address);
      setCopiedAddress(address);
    } catch {
      // If the browser blocks clipboard access, keep the address visible for manual copy.
    }
  }, []);

  useEffect(() => {
    if (!copiedAddress) return;
    const timeout = window.setTimeout(() => setCopiedAddress(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedAddress]);

  const displayAddress = authAddress || userWalletAddress;

  return (
    <div className="border-t border-border-subtle pt-4 flex flex-col gap-2">
      <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
        {t('settings.account')}
      </p>
      {isAuthenticated ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-done shrink-0" />
            {authEmail ? (
              <code className="text-xs text-text-soft truncate font-mono">{authEmail}</code>
            ) : displayAddress ? (
              <span className="text-xs text-text-soft">{t('settings.walletConnected')}</span>
            ) : (
              <span className="text-xs text-text-soft">{t('settings.connected')}</span>
            )}
          </div>
          {displayAddress && (
            <div className="flex flex-col gap-1">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-text-soft/60">
                Crypto wallet address
              </span>
              <AddressWithCopy
                address={displayAddress}
                copied={copiedAddress === displayAddress}
                onCopy={handleCopyAddress}
                copyLabel={t('common.copy')}
                copiedLabel={t('common.copied')}
              />
            </div>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="self-start text-xs text-text-soft/70 underline cursor-pointer bg-transparent border-none p-0 text-left hover:text-text"
            >
              {t('common.signOut')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-soft">{t('settings.notSignedIn')}</span>
          {userEmail && (
            <code className="text-xs text-text-soft/60 font-mono break-all">{userEmail}</code>
          )}
          {userWalletAddress && (
            <div className="flex flex-col gap-1">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-text-soft/60">
                Crypto wallet address
              </span>
              <AddressWithCopy
                address={userWalletAddress}
                copied={copiedAddress === userWalletAddress}
                onCopy={handleCopyAddress}
                copyLabel={t('common.copy')}
                copiedLabel={t('common.copied')}
              />
            </div>
          )}
        </div>
      )}
      {userId && (
        <code className="text-[0.6rem] text-text-soft/40 font-mono break-all mt-1">
          {userId}
        </code>
      )}
    </div>
  );
}
