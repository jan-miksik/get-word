'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { ToggleSwitch } from '@/components/settings/primitives';

/**
 * The mechanical typing preferences that used to live under the global typing
 * mode. They describe how the typing card behaves, not when it appears, so they
 * sit under Advanced rather than in the per-stage ladder. These stay local to
 * the device — they are about this keyboard, not about the learning plan.
 */
export function TypingOptionsSubsection() {
  const { t } = useI18n();
  const {
    typingPrefillPunctuation,
    setTypingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    setTypingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    setTypingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    setTypingCheckButtonEnabled,
  } = useAppStateContext();

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
        {t('settings.typingMode')}
      </p>
      <div className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-xs text-text">{t('settings.typingPrefillPunctuation')}</span>
        <ToggleSwitch
          checked={typingPrefillPunctuation}
          onChange={setTypingPrefillPunctuation}
          ariaLabel={t('settings.typingPrefillPunctuation')}
        />
      </div>
      <div className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-xs text-text">{t('settings.typingMobileKeyboardAutoFocus')}</span>
        <ToggleSwitch
          checked={typingMobileKeyboardAutoFocus}
          onChange={setTypingMobileKeyboardAutoFocus}
          ariaLabel={t('settings.typingMobileKeyboardAutoFocus')}
        />
      </div>
      <div className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-xs text-text">{t('settings.typingPlayAudioAfterCheck')}</span>
        <ToggleSwitch
          checked={typingPlayAudioAfterCheck}
          onChange={setTypingPlayAudioAfterCheck}
          ariaLabel={t('settings.typingPlayAudioAfterCheck')}
        />
      </div>
      <div className="flex items-start justify-between gap-3 py-0.5">
        <div className="min-w-0">
          <p className="m-0 text-xs text-text">{t('settings.typingCheckButton')}</p>
          <p className="m-0 mt-0.5 text-[0.65rem] leading-snug text-text-soft/80">
            {t('settings.typingCheckButtonNotice')}
          </p>
        </div>
        <ToggleSwitch
          checked={typingCheckButtonEnabled}
          onChange={setTypingCheckButtonEnabled}
          ariaLabel={t('settings.typingCheckButton')}
        />
      </div>
    </div>
  );
}
