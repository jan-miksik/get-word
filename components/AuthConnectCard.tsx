'use client';

import { AppLogo } from '@/components/AppLogo';

interface AuthConnectCardProps {
  brand: string;
  title: string;
  description: string;
  buttonLabel: string;
  isBusy?: boolean;
  error?: string | null;
  onSignIn: () => void;
}

export function AuthConnectCard({
  brand,
  title,
  description,
  buttonLabel,
  isBusy = false,
  error = null,
  onSignIn,
}: AuthConnectCardProps) {
  return (
    <div className="w-full max-w-xl rounded-[28px] border-2 border-[#2A2218] bg-[#F4EFE2]/95 p-6 text-[#2A2218] backdrop-blur-sm sm:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo size={76} />
          <div className="space-y-2">
            <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#6B5E48]">
              {brand}
            </p>
            <h1 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-[#2A2218] sm:text-[2.1rem]">
              {title}
            </h1>
          </div>
        </div>

        <div className="space-y-4">
          <p className="m-0 text-base leading-7 text-[#6B5E48]">
            {description}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6B5E48]">
            <span className="rounded-full border border-[#2A2218]/20 bg-[#FFF8E8] px-3 py-1.5">Email</span>
            <span className="rounded-full border border-[#2A2218]/20 bg-[#FFF8E8] px-3 py-1.5">Google</span>
            <span className="rounded-full border border-[#2A2218]/20 bg-[#FFF8E8] px-3 py-1.5">Apple</span>
            <span className="rounded-full border border-[#2A2218]/20 bg-[#FFF8E8] px-3 py-1.5">Crypto wallet</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignIn}
          disabled={isBusy}
          className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-3 text-base font-semibold text-[#F4EFE2] transition-colors hover:bg-[#155987] hover:border-[#155987] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6FA8]/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? `${buttonLabel}…` : buttonLabel}
        </button>

        {error ? (
          <p className="m-0 rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/8 px-4 py-3 text-sm text-[#8A1C1C]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
