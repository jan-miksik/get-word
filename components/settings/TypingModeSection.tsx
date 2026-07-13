'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import type { TypingWriteIn } from '@/features/learning/state/preferences';
import { Section, ToggleSwitch } from './primitives';

export function TypingModeSection() {
  const { t } = useI18n();
  const {
    typingModeEnabled,
    setTypingModeEnabled,
    typingWriteIn,
    setTypingWriteIn,
    typingAudioPromptEnabled,
    setTypingAudioPromptEnabled,
    typingPrefillPunctuation,
    setTypingPrefillPunctuation,
  } = useAppStateContext();

  const writeInOptions: { value: TypingWriteIn; label: string }[] = [
    { value: 'foreign', label: t('settings.typingWriteInForeign') },
    { value: 'both', label: t('settings.typingWriteInBoth') },
    { value: 'known', label: t('settings.typingWriteInKnown') },
  ];

  return (
    <Section label={t('settings.typingMode')}>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-sm text-text">{t('settings.typingMode')}</span>
        <ToggleSwitch
          checked={typingModeEnabled}
          onChange={setTypingModeEnabled}
          ariaLabel={t('settings.typingMode')}
        />
      </div>
      {typingModeEnabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-xs text-text-soft/80">{t('settings.typingWriteIn')}</p>
            <div
              role="radiogroup"
              aria-label={t('settings.typingWriteIn')}
              className="flex w-full flex-col gap-1 rounded-xl border border-border-subtle bg-background/30 p-1"
            >
              {writeInOptions.map((option) => {
                const selected = typingWriteIn === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTypingWriteIn(option.value)}
                    className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                      selected
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-soft hover:bg-background-elevated/40 hover:text-text'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-text">{t('settings.typingAudioPrompt')}</span>
            <ToggleSwitch
              checked={typingAudioPromptEnabled}
              onChange={setTypingAudioPromptEnabled}
              ariaLabel={t('settings.typingAudioPrompt')}
            />
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-text">{t('settings.typingPrefillPunctuation')}</span>
            <ToggleSwitch
              checked={typingPrefillPunctuation}
              onChange={setTypingPrefillPunctuation}
              ariaLabel={t('settings.typingPrefillPunctuation')}
            />
          </div>
        </>
      )}
    </Section>
  );
}
