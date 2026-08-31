'use client';

import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { useI18n } from '@/components/I18nProvider';

/**
 * The speaker control a card offers once the answer is out in the open. Shared
 * so that "there is an audio icon after you answer" looks and behaves the same
 * on every learning method instead of being re-styled per card.
 */
export function CardAudioButton({
  onPlay,
  label,
  size = 'md',
  className = '',
}: {
  onPlay: () => void;
  /** Defaults to the shared "Play audio" label. */
  label?: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const { t } = useI18n();
  const box = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={label ?? t('card.playAudio')}
      title={label ?? t('card.playAudio')}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper text-ink transition-colors duration-150 hover:border-sea hover:bg-sea hover:text-paper active:border-sea active:bg-sea active:text-paper ${box} ${className}`}
    >
      <SpeakerIcon size={size === 'lg' ? 23 : 20} />
    </button>
  );
}
