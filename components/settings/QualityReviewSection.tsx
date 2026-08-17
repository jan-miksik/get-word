'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from '@/components/settings/primitives';

/**
 * The two quality-review consents.
 *
 * They are deliberately not one switch: letting a project editor read a word
 * pair and shipping that pair to a third-party model are different asks, so
 * the AI one is off by default and stays independently revocable. The account
 * switch is only half the gate — `word_lists.review_opt_in` is the other half,
 * which is why turning this on never resurrects a list that opted out.
 */
export function QualityReviewSection() {
  const { t } = useI18n();
  const { reviewOptIn, setReviewOptIn, aiReviewOptIn, setAiReviewOptIn } =
    useAppStateContext();

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

      <div className="flex items-start justify-between gap-3 py-0.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-text">{t('settings.qualityReviewAi')}</span>
          <span className="text-xs text-text-soft">{t('settings.qualityReviewAiHint')}</span>
        </span>
        <ToggleSwitch
          checked={aiReviewOptIn}
          onChange={setAiReviewOptIn}
          ariaLabel={t('settings.qualityReviewAi')}
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
