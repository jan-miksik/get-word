'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * What the study surface shows when the deck runs out.
 *
 * Emptying the deck used to end in the words "All done!" and nothing else,
 * which is a dead end at exactly the moment someone still wants to study. So
 * this screen always carries the ways forward instead: practise the words that
 * are settling in before their next repeat, add new ones, or photograph
 * something and name it. The headline can be overridden for the cases that are
 * not really "done" — an empty filter, for instance — so those get the same
 * exits rather than their own dead end.
 */
export function SessionDoneCard({
  title,
  settlingCount,
  showNotReady,
  onToggleShowNotReady,
  onOpenWordChat,
  onOpenPhotoLab,
}: {
  /** Overrides the default headline; the actions stay the same. */
  title?: string;
  settlingCount: number;
  showNotReady: boolean;
  onToggleShowNotReady?: () => void;
  onOpenWordChat?: () => void;
  onOpenPhotoLab?: () => void;
}) {
  const { t } = useI18n();
  const canPractiseAhead = settlingCount > 0 && Boolean(onToggleShowNotReady);

  return (
    <div className="study-ink-scope flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="m-0 max-w-md text-lg font-semibold text-text">
        {title ?? t('learning.sessionDoneTitle')}
      </p>
      <p className="m-0 max-w-md text-sm text-text-soft">
        {canPractiseAhead
          ? t('learning.sessionDoneSettling', { count: settlingCount })
          : t('learning.sessionDoneBody')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {canPractiseAhead ? (
          <button
            type="button"
            onClick={onToggleShowNotReady}
            className="onboarding-option onboarding-option-highlight rounded-full px-5 py-2.5 text-sm font-extrabold"
          >
            {showNotReady
              ? t('learning.sessionDoneHideAhead')
              : t('learning.sessionDonePractiseAhead', { count: settlingCount })}
          </button>
        ) : null}
        {onOpenWordChat ? (
          <button
            type="button"
            onClick={onOpenWordChat}
            className={[
              'onboarding-option rounded-full px-5 py-2.5 text-sm font-extrabold',
              canPractiseAhead ? '' : 'onboarding-option-highlight',
            ].join(' ')}
          >
            {t('wordChat.addWords')}
          </button>
        ) : null}
        {onOpenPhotoLab ? (
          <button
            type="button"
            onClick={onOpenPhotoLab}
            className="onboarding-option rounded-full px-5 py-2.5 text-sm font-extrabold"
          >
            {t('learning.noPersonalWordsPhotoLab')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
