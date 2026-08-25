'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * What the study surface shows when the deck runs out.
 *
 * Emptying the deck used to end in the words "All done!" and nothing else,
 * which is a dead end at exactly the moment someone still wants to study. So
 * this screen always carries a way forward: add new words. The headline can be
 * overridden for the cases that are not really "done" — an empty filter, for
 * instance — so those get the same exit rather than their own dead end.
 *
 * Practising the words that are still settling used to be offered here as a
 * third button. It went: pulling words forward before their interval is due is
 * the one exit that works against the schedule, and offering it beside "add
 * words" made it look like an equal choice. Stream mode still lists them behind
 * `SettlingWordsFooter` for anyone who deliberately goes looking.
 *
 * An emptied deck is not the same as an empty backlog. The day's plan caps how
 * many repeats it takes, so a finished plan can sit on top of dozens of words
 * that are due this minute — and the Upcoming panel lists them by name. Saying
 * "nothing due right now" there is simply false, so whenever repeats are still
 * waiting the card says the day's goal is done and offers to carry on into
 * them.
 */
export function SessionDoneCard({
  title,
  settlingCount,
  dueNowCount = 0,
  onStudyExtra,
  onOpenWordChat,
}: {
  /** Overrides the default headline; the actions stay the same. */
  title?: string;
  /** Words resting before their next repeat; named in the body copy only. */
  settlingCount: number;
  /** Repeats due right now that today's plan did not take. */
  dueNowCount?: number;
  /** Lifts the day's cap so those repeats join the stream. */
  onStudyExtra?: () => void;
  onOpenWordChat?: () => void;
}) {
  const { t } = useI18n();
  const hasExtraDue = dueNowCount > 0 && Boolean(onStudyExtra);

  return (
    <div className="study-ink-scope flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="m-0 max-w-md text-lg font-semibold text-text">
        {title ?? (hasExtraDue ? t('learning.sessionDayDoneTitle') : t('learning.sessionDoneTitle'))}
      </p>
      <p className="m-0 max-w-md text-sm text-text-soft">
        {hasExtraDue
          ? t('learning.sessionDoneExtraDue', { count: dueNowCount })
          : settlingCount > 0
            ? t('learning.sessionDoneSettling', { count: settlingCount })
            : t('learning.sessionDoneBody')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasExtraDue ? (
          <button
            type="button"
            onClick={onStudyExtra}
            className="onboarding-option onboarding-option-highlight rounded-full px-5 py-2.5 text-sm font-extrabold"
          >
            {t('learning.sessionDayExtraAction', { count: dueNowCount })}
          </button>
        ) : null}
        {onOpenWordChat ? (
          <button
            type="button"
            onClick={onOpenWordChat}
            className={[
              'onboarding-option rounded-full px-5 py-2.5 text-sm font-extrabold',
              hasExtraDue ? '' : 'onboarding-option-highlight',
            ].join(' ')}
          >
            {t('wordChat.addWords')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
