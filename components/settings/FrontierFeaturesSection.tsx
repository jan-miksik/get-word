'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from './primitives';

export function FrontierFeaturesSection() {
  const { t } = useI18n();
  const { swipeCardsEnabled, setSwipeCardsEnabled, photoLabEnabled, setPhotoLabEnabled } =
    useAppStateContext();

  return (
    <Section label={t('settings.frontierFeatures')}>
      <p className="m-0 text-xs text-text-soft/80">{t('settings.frontierFeaturesNotice')}</p>
      {/* One row per experimental feature; new frontier toggles slot in below. */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between py-0.5">
          <span className="text-sm text-text">{t('settings.swipeCards')}</span>
          <ToggleSwitch
            checked={swipeCardsEnabled}
            onChange={setSwipeCardsEnabled}
            ariaLabel={t('settings.swipeCards')}
          />
        </div>
        <p className="m-0 text-xs text-text-soft/60">{t('settings.swipeCardsNotice')}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between py-0.5">
          <span className="text-sm text-text">{t('settings.photoLab')}</span>
          <ToggleSwitch
            checked={photoLabEnabled}
            onChange={setPhotoLabEnabled}
            ariaLabel={t('settings.photoLab')}
          />
        </div>
        <p className="m-0 text-xs text-text-soft/60">{t('settings.photoLabNotice')}</p>
        {photoLabEnabled && (
          <a href="/photo-lab" className="text-xs text-accent underline">
            {t('settings.photoLabOpen')}
          </a>
        )}
      </div>
    </Section>
  );
}
