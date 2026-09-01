'use client';

import { useI18n } from '@/components/I18nProvider';
import { ContinueButton } from './ContinueButton';
import { SessionCardShell } from './SessionCardShell';

export function SessionTimeNewWordsCard({ onAddWords }: { onAddWords: () => void }) {
  const { t } = useI18n();
  return (
    <SessionCardShell>
      <h2 className="m-0 text-2xl font-black leading-tight text-ink-800">
        {t('learning.sessionTimeNewEmptyTitle')}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        {t('learning.sessionTimeNewEmptyBody')}
      </p>
      <ContinueButton
        onClick={onAddWords}
        label={t('learning.sessionTimeNewEmptyAction')}
        className="mx-auto mt-6 max-w-sm"
      />
    </SessionCardShell>
  );
}

export function SessionTimePracticePendingCard() {
  const { t } = useI18n();
  return (
    <SessionCardShell>
      <p className="m-0 text-base font-bold text-ink-500">
        {t('learning.sessionTimePracticeLoading')}
      </p>
    </SessionCardShell>
  );
}

export function SessionTimeNoPracticeCard({ onAddWords }: { onAddWords: () => void }) {
  const { t } = useI18n();
  return (
    <SessionCardShell>
      <h2 className="m-0 text-2xl font-black leading-tight text-ink-800">
        {t('learning.sessionTimeReviewEmptyTitle')}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        {t('learning.sessionTimeReviewEmptyBody')}
      </p>
      <ContinueButton
        onClick={onAddWords}
        label={t('learning.sessionTimeNewEmptyAction')}
        className="mx-auto mt-6 max-w-sm"
      />
    </SessionCardShell>
  );
}
