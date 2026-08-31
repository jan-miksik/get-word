'use client';

import { useI18n } from '@/components/I18nProvider';
import { SessionCardShell } from './SessionCardShell';

/** The clock-owned seam between introducing words and checking them again. */
export function SessionTimeTransitionCard({ onContinue }: { onContinue: () => void }) {
  const { t } = useI18n();

  return (
    <SessionCardShell>
      <h2 className="m-0 text-2xl font-black leading-tight tracking-[-0.025em] text-ink-800 sm:text-[1.8rem]">
        {t('learning.sessionBreatherDoneNew')}
      </h2>
      <div className="mx-auto mt-7 flex max-w-xs flex-col items-stretch gap-2">
        <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
          {t('learning.sessionBreatherNextUpReview')}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="onboarding-option onboarding-option-highlight min-h-12 rounded-full px-5 py-3 text-base font-extrabold"
        >
          {t('learning.sessionBreatherAction')}
        </button>
      </div>
    </SessionCardShell>
  );
}
