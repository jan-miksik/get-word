'use client';

import { TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE_OPTIONS, STAGES } from '@/lib/words';
import type { I18nKey } from '@/lib/i18n/messages';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { ToggleSwitch } from '@/components/settings/primitives';

/**
 * The mechanical typing preferences that used to live under the global typing
 * mode. They describe how the typing card behaves, not when it appears, so they
 * sit under Advanced rather than in the per-stage ladder. These stay local to
 * the device — they are about this keyboard, not about the learning plan.
 *
 * The replay-button cutoff is the one exception: like the memory-hook and
 * study-note cutoffs, it is about the learning plan (when a word has proven
 * itself enough that hearing it on demand becomes a crutch), so it is synced
 * like they are rather than staying device-local.
 */
export function TypingOptionsSubsection() {
  const { t } = useI18n();
  const {
    typingPrefillPunctuation,
    setTypingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    setTypingMobileKeyboardAutoFocus,
    typingAudioReplayHideFromStage,
    setTypingAudioReplayHideFromStage,
  } = useAppStateContext();

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft">
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
      <label className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-xs text-text">{t('settings.typingAudioReplayHideFromStage')}</span>
        <select
          value={typingAudioReplayHideFromStage}
          onChange={(e) => setTypingAudioReplayHideFromStage(Number(e.target.value))}
          aria-label={t('settings.typingAudioReplayHideFromStage')}
          className="rounded-lg border border-border-subtle bg-background px-2 py-1 text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE_OPTIONS.map((stage) => (
            <option key={stage} value={stage}>
              {t(`stage.${STAGES[stage]?.id ?? stage}` as I18nKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
