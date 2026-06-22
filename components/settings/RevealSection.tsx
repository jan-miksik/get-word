'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from './primitives';

export function RevealSection() {
  const { t } = useI18n();
  const { progressiveRevealEnabled, setProgressiveRevealEnabled } = useAppStateContext();

  return (
    <Section label={t('settings.reveal')}>
      <div className="flex items-center justify-between gap-4 py-0.5">
        <div>
          <p className="m-0 text-sm text-text">{t('settings.progressiveReveal')}</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-text-soft">
            {t('settings.progressiveRevealNotice')}
          </p>
        </div>
        <ToggleSwitch
          checked={progressiveRevealEnabled}
          onChange={setProgressiveRevealEnabled}
          ariaLabel={t('settings.progressiveReveal')}
        />
      </div>
    </Section>
  );
}
