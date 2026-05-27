'use client';

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { isAudioNetworkOffline } from '@/lib/audio-network-policy';

export type AudioPlaybackResult = {
  ok: boolean;
  interrupted: boolean;
};

type AudioElementRef = {
  current: HTMLAudioElement | null;
};

function getPlaybackCandidates(audioSrc: string | string[] | null): string[] {
  const sources = (Array.isArray(audioSrc) ? audioSrc : [audioSrc])
    .filter((src): src is string => Boolean(src));

  return Array.from(
    new Set(sources.flatMap((src) => getArweaveGatewayUrlCandidates(src))),
  );
}

/**
 * Begin playback synchronously from a click/tap handler.
 *
 * Mobile browsers may reject `play()` when a network probe is awaited first,
 * because the original user activation no longer applies by then.
 */
export function playUserInitiatedAudio(
  audioRef: AudioElementRef,
  audioSrc: string | string[] | null,
): Promise<AudioPlaybackResult> {
  const candidates = getPlaybackCandidates(audioSrc);
  if (candidates.length === 0) {
    return Promise.resolve({ ok: false, interrupted: false });
  }

  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }

  const audio = new Audio(candidates[0]);
  audio.preload = 'auto';
  audioRef.current = audio;

  return new Promise((resolve) => {
    let candidateIndex = 0;
    let settled = false;
    let attempt = 0;

    const done = (result: AudioPlaybackResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const tryNextCandidate = () => {
      if (audioRef.current !== audio) {
        done({ ok: false, interrupted: true });
        return;
      }
      if (isAudioNetworkOffline()) {
        done({ ok: false, interrupted: false });
        return;
      }

      candidateIndex += 1;
      if (candidateIndex >= candidates.length) {
        done({ ok: false, interrupted: false });
        return;
      }

      audio.src = candidates[candidateIndex];
      audio.load();
      beginAttempt();
    };

    const beginAttempt = () => {
      const currentAttempt = ++attempt;
      audio.onerror = () => {
        if (currentAttempt !== attempt || settled) return;
        tryNextCandidate();
      };

      try {
        audio.play()
          .then(() => done({ ok: true, interrupted: false }))
          .catch((err) => {
            if (currentAttempt !== attempt || settled) return;
            const message = err instanceof Error ? err.message : String(err);
            if (/interrupted by a call to pause/i.test(message)) {
              done({ ok: false, interrupted: true });
              return;
            }
            tryNextCandidate();
          });
      } catch {
        tryNextCandidate();
      }
    };

    beginAttempt();
  });
}
