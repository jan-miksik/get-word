'use client';

import { AuthConnectCard } from '@/components/AuthConnectCard';
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
        <AuthConnectCard
          brand={t('auth.brand')}
          title={t('auth.connectTitle')}
          description={t('auth.connectDescription')}
          buttonLabel={t('auth.connectButton')}
          isBusy={isBusy}
          error={error}
          onSignIn={onSignIn}
        />
      </div>
    </main>
  );
}
