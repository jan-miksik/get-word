'use client';

import { useCallback, useEffect, useRef } from 'react';

import { playUserInitiatedAudio, type AudioPlaybackResult } from '@/lib/audio-playback';

/**
 * The one audio channel a learning card owns.
 *
 * Every card — reveal, typing, choice, matching, assembly, bubbles — plays its
 * clips through this hook rather than growing its own `<audio>` element and
 * cleanup effect. It keeps three things the same everywhere:
 *
 *   - a single element per card, so starting a clip stops the previous one;
 *   - a pause on unmount, so a card that leaves the deck stops talking;
 *   - the shared gateway fallbacks and press-again-for-slow rules from
 *     `lib/audio-playback`.
 *
 * `play` is for a press the learner made (tap-twice-for-slow applies);
 * `playAuto` is for a clip the card starts by itself after a correct answer,
 * where there was no press to repeat and normal speed is always right.
 */
export function useCardAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  const play = useCallback(
    (audioSrc: string | string[] | null): Promise<AudioPlaybackResult> =>
      playUserInitiatedAudio(audioRef, audioSrc),
    [],
  );

  const playAuto = useCallback(
    (audioSrc: string | string[] | null): Promise<AudioPlaybackResult> =>
      playUserInitiatedAudio(audioRef, audioSrc, { slowOnRepeat: false }),
    [],
  );

  return { audioRef, play, playAuto };
}
