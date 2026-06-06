'use client';

import { AppLogo } from '@/components/AppLogo';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { useI18n } from '@/components/I18nProvider';

interface AuthRequiredCardProps {
  onSignIn: () => void;
  isBusy?: boolean;
  error?: string | null;
}

export function AuthRequiredCard({ onSignIn, isBusy = false, error = null }: AuthRequiredCardProps) {
  const { t } = useI18n();
  return (
    <main className="app bg-[#dcd1b9] px-4 py-8 sm:px-6 sm:py-10">
      <SpeckledBackground />
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md rounded-[28px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 p-6 text-[#2A2218] backdrop-blur-sm sm:p-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <AppLogo size={72} />
            <div className="space-y-2">
              <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
                {t('auth.brand')}
              </p>
              <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em] text-[#2A2218]">
                {t('auth.connectTitle')}
              </h1>
              <p className="m-0 text-sm leading-6 text-[#6B5E48]">
                {t('auth.connectDescription')}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              disabled={isBusy}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] transition-colors hover:bg-[#155987] hover:border-[#155987] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? `${t('auth.connectButton')}…` : t('auth.connectButton')}
            </button>
            {error ? (
              <p
                className="m-0 w-full rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/8 px-4 py-3 text-sm text-[#8A1C1C]"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
