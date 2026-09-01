'use client';

import { useCallback } from 'react';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import {
  DEFAULT_MINIGAME_FREQUENCY,
  MINIGAME_FREQUENCY_MIN,
  MINIGAME_FREQUENCY_MAX,
} from '@/features/learning/minigames';
import { useI18n } from '@/components/I18nProvider';
import { Section, ToggleSwitch } from '@/components/settings/primitives';

export function MinigamesSection({
  minigameFrequency,
  onMinigameFrequencyChange,
}: {
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
}) {
  const { t } = useI18n();

  const minFreq =
    minigameFrequency !== 'off' ? minigameFrequency.min : DEFAULT_MINIGAME_FREQUENCY.min;
  const maxFreq =
    minigameFrequency !== 'off' ? minigameFrequency.max : DEFAULT_MINIGAME_FREQUENCY.max;
  const minFreqPercent =
    ((minFreq - MINIGAME_FREQUENCY_MIN) / (MINIGAME_FREQUENCY_MAX - MINIGAME_FREQUENCY_MIN)) *
    100;
  const maxFreqPercent =
    ((maxFreq - MINIGAME_FREQUENCY_MIN) / (MINIGAME_FREQUENCY_MAX - MINIGAME_FREQUENCY_MIN)) *
    100;

  const handleMinChange = useCallback(
    (value: number) => {
      if (minigameFrequency === 'off') return;
      const next = Math.max(MINIGAME_FREQUENCY_MIN, Math.min(minigameFrequency.max, value));
      onMinigameFrequencyChange({ min: next, max: minigameFrequency.max });
    },
    [minigameFrequency, onMinigameFrequencyChange]
  );

  const handleMaxChange = useCallback(
    (value: number) => {
      if (minigameFrequency === 'off') return;
      const next = Math.max(minigameFrequency.min, Math.min(MINIGAME_FREQUENCY_MAX, value));
      onMinigameFrequencyChange({ min: minigameFrequency.min, max: next });
    },
    [minigameFrequency, onMinigameFrequencyChange]
  );

  return (
    <Section
      label={t('settings.minigames')}
      action={
        <ToggleSwitch
          checked={minigameFrequency !== 'off'}
          onChange={(on) => onMinigameFrequencyChange(on ? DEFAULT_MINIGAME_FREQUENCY : 'off')}
          ariaLabel={t('settings.minigames')}
        />
      }
    >
      {minigameFrequency !== 'off' && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-xs text-text-soft">{t('settings.cardsBetweenGames')}</p>
            <div className="rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums text-text">
              {minFreq}–{maxFreq}
            </div>
          </div>
          <div className="minigame-range-control">
            <div className="minigame-range-track" />
            <div
              className="minigame-range-track-fill"
              style={{
                left: `${minFreqPercent}%`,
                right: `${100 - maxFreqPercent}%`,
              }}
            />
            <div
              className="minigame-range-handle"
              style={{ left: `${minFreqPercent}%` }}
              aria-hidden
            >
              {minFreq}
            </div>
            <div
              className="minigame-range-handle"
              style={{ left: `${maxFreqPercent}%` }}
              aria-hidden
            >
              {maxFreq}
            </div>
            <input
              type="range"
              min={MINIGAME_FREQUENCY_MIN}
              max={MINIGAME_FREQUENCY_MAX}
              value={minFreq}
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className={`minigame-range-input ${minFreq >= maxFreq ? 'is-front' : ''}`}
              aria-label={t('settings.minCardsBetweenGames')}
            />
            <input
              type="range"
              min={MINIGAME_FREQUENCY_MIN}
              max={MINIGAME_FREQUENCY_MAX}
              value={maxFreq}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="minigame-range-input is-upper"
              aria-label={t('settings.maxCardsBetweenGames')}
            />
          </div>
          <div className="flex items-center justify-between text-[0.65rem] font-medium uppercase tracking-wide text-text-soft">
            <span>{MINIGAME_FREQUENCY_MIN}</span>
            <span>{MINIGAME_FREQUENCY_MAX}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
