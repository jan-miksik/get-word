'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from '@/components/settings/primitives';

export function FrontierFeaturesSection() {
  const { t } = useI18n();
  const { swipeCardsEnabled, setSwipeCardsEnabled } = useAppStateContext();

  return (
    <Section label={t('settings.frontierFeatures')}>
      <p className="m-0 text-xs text-text-soft/80">{t('settings.frontierFeaturesNotice')}</p>
      {/* Swipe cards still has an on/off toggle. Photo lab graduated to the main
          menu (always on), so it keeps only a description + link here, no toggle;
          the tilt quiz was retired entirely. */}
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
        <p className="m-0 text-xs font-medium text-text-soft/70">{t('settings.swipeCardsMobileOnly')}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-text">{t('settings.photoLab')}</span>
        <p className="m-0 text-xs text-text-soft/60">{t('settings.photoLabNotice')}</p>
        <a href="/photo-lab" className="text-xs text-accent underline">
          {t('settings.photoLabOpen')}
        </a>
      </div>
    </Section>
  );
}
