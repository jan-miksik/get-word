'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from '@/components/settings/primitives';

/**
 * The quality-review consent: letting a project editor read a word pair.
 *
 * The account switch is only half the gate — `word_lists.review_opt_in` is the
 * other half, which is why turning this on never resurrects a list that opted
 * out.
 *
 * There is deliberately no second switch for the AI check. It is not a
 * separate ask: it reads pairs this consent already covers, on the same two
 * words the translation step sends to a machine translator anyway.
 * `users.ai_review_opt_in` is left over from when it was a switch and nothing
 * reads it.
 */
export function QualityReviewSection() {
  const { t } = useI18n();
  const { reviewOptIn, setReviewOptIn } = useAppStateContext();

  return (
    <Section label={t('settings.qualityReview')}>
      <div className="flex items-start justify-between gap-3 py-0.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-text">{t('settings.qualityReviewEditor')}</span>
          <span className="text-xs text-text-soft">
            {t('settings.qualityReviewEditorHint')}
          </span>
        </span>
        <ToggleSwitch
          checked={reviewOptIn}
          onChange={setReviewOptIn}
          ariaLabel={t('settings.qualityReviewEditor')}
        />
      </div>

      <p className="m-0 text-xs text-text-soft">
        {t('settings.qualityReviewNote')}{' '}
        <Link href="/privacy" className="text-accent underline">
          {t('settings.qualityReviewPrivacyLink')}
        </Link>
      </p>
    </Section>
  );
}
