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
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#2A2218] bg-[#F4EFE2] text-[#2A2218] transition-colors duration-150 hover:border-[#1E6FA8] hover:bg-[#1E6FA8] hover:text-[#F4EFE2] active:border-[#1E6FA8] active:bg-[#1E6FA8] active:text-[#F4EFE2] ${box} ${className}`}
    >
      <SpeakerIcon size={size === 'lg' ? 23 : 20} />
    </button>
  );
}
