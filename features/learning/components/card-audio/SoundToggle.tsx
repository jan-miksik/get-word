'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * The card's mute switch: "should this card speak by itself?".
 *
 * It flips the one shared setting in `cardSound`, so silencing a bubble round
 * silences the typing card two swipes later — which is why the control has to
 * look and sit the same everywhere rather than being redrawn per card. It rides
 * in `CardTopControls`, beside the stage badge.
 */
export function SoundToggle({
  soundEnabled,
  onToggle,
}: {
  soundEnabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      aria-label={soundEnabled ? t('game.soundOn') : t('game.soundOff')}
      title={soundEnabled ? t('game.disableAudio') : t('game.enableAudio')}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-paper text-ink transition-colors duration-150 hover:border-sea hover:bg-sea hover:text-paper active:border-sea active:bg-sea active:text-paper"
    >
      {soundEnabled ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}
    </button>
  );
}
