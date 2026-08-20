'use client';

import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import type { RevealMode } from '@/features/learning/state/preferences';
import { Section } from '@/components/settings/primitives';

export function RevealSection() {
  const { t } = useI18n();
  const { revealMode, setRevealMode } = useAppStateContext();

  const modeOptions: { value: RevealMode; label: string }[] = [
    { value: 'press', label: t('settings.revealModePress') },
    { value: 'scratch', label: t('settings.revealModeScratch') },
  ];

  return (
    <Section label={t('settings.reveal')}>
      <div
        role="radiogroup"
        aria-label={t('settings.reveal')}
        className="inline-flex w-full gap-1 rounded-xl border border-border-subtle bg-background-elevated p-1"
      >
        {modeOptions.map((option) => {
          const selected = revealMode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setRevealMode(option.value)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
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
    </Section>
  );
}
