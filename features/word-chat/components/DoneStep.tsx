'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { CommitResult } from '../types';

type Props = {
  result: CommitResult;
  refreshStatus: 'idle' | 'pending' | 'success' | 'error';
  onRetryRefresh: () => Promise<void>;
  /**
   * A short practice with the words that just landed, built by the host. Held
   * back until the stream has actually been rebuilt — before that the words it
   * would practise are not there yet.
   */
  practiceOffer?: ReactNode;
  /** Clears the flow and hands back an empty add-words screen. */
  onAddMore?: () => void;
  onDone?: () => void;
};

/**
 * The handoff between adding words and whatever comes next.
 *
 * Everything the learner asked for is already saved by the time this renders,
 * so the screen has one job: confirm what landed and offer the ways on. There
 * are three, in the order people actually want them — try the new words out in
 * a short game, add another batch, or go back to studying.
 */
export function DoneStep({
  result,
  refreshStatus,
  onRetryRefresh,
  practiceOffer,
  onAddMore,
  onDone,
}: Props) {
  const { t } = useI18n();
  const failed = refreshStatus === 'error';
  const preparing = refreshStatus === 'idle' || refreshStatus === 'pending';
  const carriedOver = result.takeoverCount + result.upgradedTakeoverCount > 0;
  const showPractice = Boolean(practiceOffer) && refreshStatus === 'success';

  return (
    <div className="flex flex-col items-center gap-7 py-6 text-center motion-safe:animate-[word-chat-setup-enter_320ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="flex flex-col items-center gap-5">
        <span
          aria-hidden="true"
          className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--ob-accent)] text-3xl text-[var(--ob-surface)] shadow-[0_16px_38px_color-mix(in_srgb,var(--ob-accent)_28%,transparent)] motion-safe:animate-[word-chat-audio-ready_520ms_cubic-bezier(0.16,1,0.3,1)_both]"
        >
          <span className="absolute inset-0 rounded-full bg-[var(--ob-accent)] motion-safe:animate-[word-chat-audio-ready-ring_1.6s_ease-out_infinite]" />
          <span className="relative">✓</span>
        </span>

        <div className="space-y-2">
          <h2 className="text-2xl font-black leading-tight sm:text-3xl">
            {t('wordChat.doneTitle')}
          </h2>
          <p className="text-base font-black tabular-nums text-[var(--ob-accent)]">
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
      ) : showPractice ? null : (
        <p className="text-xs font-bold onboarding-text-soft" role="status">
          {t('wordChat.studyReady')}
        </p>
      )}

      {showPractice ? <div className="w-full">{practiceOffer}</div> : null}

      {/* Both exits, side by side and equally weighted: neither adding another
          batch nor going back to study is the obvious next move, and making one
          of them the loud button would be guessing on the learner's behalf. */}
      {onAddMore || onDone ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {onAddMore ? (
            <button
              type="button"
              onClick={onAddMore}
              className="onboarding-option flex-1 rounded-xl px-5 py-3.5 text-center text-sm font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {t('wordChat.moreWordsAction')}
            </button>
          ) : null}
          {onDone ? (
            <button
              type="button"
              onClick={onDone}
              disabled={refreshStatus === 'pending'}
              className={[
                'flex-1 rounded-xl px-5 py-3.5 text-center text-sm font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50',
                showPractice ? 'onboarding-option' : 'onboarding-option onboarding-option-highlight',
              ].join(' ')}
            >
              {t('wordChat.backToStudy')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
