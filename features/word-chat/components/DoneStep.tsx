'use client';

import { useI18n } from '@/components/I18nProvider';
import type { CommitResult } from '../types';

type Props = {
  result: CommitResult;
  refreshStatus: 'idle' | 'pending' | 'success' | 'error';
  onRetryRefresh: () => Promise<void>;
  onDone?: () => void;
};

/**
 * The handoff between adding words and studying them.
 *
 * Everything the learner asked for is already saved by the time this renders,
 * so the screen has one job: confirm what landed and carry them into the study
 * stream. It stands in for a bare spinner — the count is the receipt, and the
 * rail underneath is the study stream being rebuilt with the new words in it.
 */
export function DoneStep({
  result,
  refreshStatus,
  onRetryRefresh,
  onDone,
}: Props) {
  const { t } = useI18n();
  const failed = refreshStatus === 'error';
  const preparing = refreshStatus === 'idle' || refreshStatus === 'pending';
  const carriedOver = result.takeoverCount + result.upgradedTakeoverCount > 0;

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center motion-safe:animate-[word-chat-setup-enter_320ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <span
        aria-hidden="true"
        className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--ob-accent)] text-3xl text-[var(--ob-surface)] shadow-[0_16px_38px_color-mix(in_srgb,var(--ob-accent)_28%,transparent)] motion-safe:animate-[word-chat-audio-ready_520ms_cubic-bezier(0.16,1,0.3,1)_both]"
      >
        <span className="absolute inset-0 rounded-full bg-[var(--ob-accent)] motion-safe:animate-[word-chat-audio-ready-ring_1.6s_ease-out_infinite]" />
        <span className="relative">✓</span>
      </span>

      <div className="space-y-2">
        <h2 className="text-lg font-black">{t('wordChat.doneTitle')}</h2>
        <p className="text-2xl font-black tabular-nums text-[var(--ob-accent)]">
          {t('wordChat.doneWordsCount', { count: result.itemCount })}
        </p>
        {carriedOver ? (
          <p className="text-xs leading-relaxed onboarding-text-soft">
            {t('wordChat.doneSummary', {
              items: result.itemCount,
              takeovers: result.takeoverCount,
              upgrades: result.upgradedTakeoverCount,
            })}
          </p>
        ) : null}
      </div>

      {failed ? (
        <div className="onboarding-notice w-full space-y-2 rounded-xl px-3 py-2.5 text-sm">
          <p>{t('wordChat.refreshFailed')}</p>
          <button type="button" className="font-bold underline" onClick={() => void onRetryRefresh()}>
            {t('wordChat.retryRefresh')}
          </button>
        </div>
      ) : preparing ? (
        <div className="w-full max-w-xs space-y-2">
          <div
            role="progressbar"
            aria-label={t('wordChat.preparingStudy')}
            className="h-1.5 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--ob-ink)_12%,transparent)]"
          >
            <div className="h-full w-2/5 rounded-full bg-[var(--ob-accent)] motion-safe:animate-[word-chat-handoff-rail_1.25s_ease-in-out_infinite] motion-reduce:w-full" />
          </div>
          <p className="text-xs font-bold onboarding-text-soft">
            {t('wordChat.preparingStudy')}
          </p>
        </div>
      ) : (
        <p className="text-xs font-bold onboarding-text-soft" role="status">
          {t('wordChat.studyReady')}
        </p>
      )}

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
