'use client';

import { useI18n } from '@/components/I18nProvider';
import type { CommitResult } from '../types';

type Props = {
  result: CommitResult;
  refreshStatus: 'idle' | 'pending' | 'success' | 'error';
  onRetryRefresh: () => Promise<void>;
  onDone?: () => void;
};

export function DoneStep({
  result,
  refreshStatus,
  onRetryRefresh,
  onDone,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-extrabold">{t('wordChat.doneTitle')}</h2>
        <p className="mt-1 text-sm onboarding-text-soft">
          {t('wordChat.doneSummary', {
            items: result.itemCount,
            takeovers: result.takeoverCount,
            upgrades: result.upgradedTakeoverCount,
          })}
        </p>
      </div>

      {refreshStatus === 'pending' ? (
        <p className="onboarding-notice rounded-md px-3 py-2 text-sm">
          {t('wordChat.refreshingStream')}
        </p>
      ) : null}
      {refreshStatus === 'error' ? (
        <div className="onboarding-notice space-y-2 rounded-md px-3 py-2 text-sm">
          <p>{t('wordChat.refreshFailed')}</p>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => void onRetryRefresh()}
          >
            {t('wordChat.retryRefresh')}
          </button>
        </div>
      ) : null}

      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          disabled={refreshStatus === 'pending'}
          className="onboarding-option onboarding-option-highlight w-full rounded-xl px-5 py-3 text-center text-sm font-extrabold disabled:opacity-50"
        >
          {t('wordChat.backToStudy')}
        </button>
      ) : null}
    </div>
  );
}
