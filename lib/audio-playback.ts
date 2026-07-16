'use client';

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { getCachedPlayableAudioUrl } from '@/lib/audio-availability';
import { withAudioDebugParam } from '@/lib/audio-debug';
import { isAudioNetworkOffline } from '@/lib/audio-network-policy';
import { getPrefetchedAudioUrl } from '@/lib/audio-prefetch';

export type AudioPlaybackResult = {
  ok: boolean;
  interrupted: boolean;
};

export type AudioPlaybackDebugEvent =
  | { type: 'empty' }
  | { type: 'start'; candidateIndex: number; src: string }
  | { type: 'success'; candidateIndex: number; src: string }
  | { type: 'error'; candidateIndex: number; src: string; error: string }
  | { type: 'rejected'; candidateIndex: number; src: string; error: string }
  | { type: 'offline'; candidateIndex: number; src: string }
  | { type: 'exhausted'; candidateIndex: number; src: string }
  | { type: 'interrupted'; candidateIndex: number; src: string };

export type AudioPlaybackDebugHandler = (event: AudioPlaybackDebugEvent) => void;

type AudioElementRef = {
  current: HTMLAudioElement | null;
};

function getPlaybackCandidates(audioSrc: string | string[] | null): string[] {
  const sources = (Array.isArray(audioSrc) ? audioSrc : [audioSrc])
    .filter((src): src is string => Boolean(src));
  const gatewayCandidates = sources.flatMap((src) =>
    getArweaveGatewayUrlCandidates(src).map(withAudioDebugParam),
  );
  const warmedCandidates = sources
    .map(getCachedPlayableAudioUrl)
    .filter((src): src is string => Boolean(src));
  const downloadedCandidates = [...warmedCandidates, ...gatewayCandidates]
    .map(getPrefetchedAudioUrl)
    .filter((src): src is string => Boolean(src));

  return Array.from(
    new Set(
      [
        ...downloadedCandidates,
        ...warmedCandidates,
        ...gatewayCandidates,
      ],
    ),
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
  options: { onDebug?: AudioPlaybackDebugHandler } = {},
): Promise<AudioPlaybackResult> {
  const candidates = getPlaybackCandidates(audioSrc);
  if (candidates.length === 0) {
    options.onDebug?.({ type: 'empty' });
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
        options.onDebug?.({
          type: 'interrupted',
          candidateIndex,
          src: candidates[candidateIndex],
        });
        done({ ok: false, interrupted: true });
        return;
      }
      if (isAudioNetworkOffline()) {
        options.onDebug?.({
          type: 'offline',
          candidateIndex,
          src: candidates[candidateIndex],
        });
        done({ ok: false, interrupted: false });
        return;
      }

      candidateIndex += 1;
      if (candidateIndex >= candidates.length) {
        options.onDebug?.({
          type: 'exhausted',
          candidateIndex: candidateIndex - 1,
          src: candidates[candidateIndex - 1],
        });
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
        options.onDebug?.({
          type: 'error',
          candidateIndex,
          src: candidates[candidateIndex],
          error: audio.error?.message || `media error ${audio.error?.code ?? 'unknown'}`,
        });
        tryNextCandidate();
      };

      try {
        options.onDebug?.({
          type: 'start',
          candidateIndex,
          src: candidates[candidateIndex],
        });
        audio.play()
          .then(() => {
            options.onDebug?.({
              type: 'success',
              candidateIndex,
              src: candidates[candidateIndex],
            });
            done({ ok: true, interrupted: false });
          })
          .catch((err) => {
            if (currentAttempt !== attempt || settled) return;
            const message = err instanceof Error ? err.message : String(err);
            if (/interrupted by a call to pause/i.test(message)) {
              options.onDebug?.({
                type: 'interrupted',
                candidateIndex,
                src: candidates[candidateIndex],
              });
              done({ ok: false, interrupted: true });
              return;
            }
            options.onDebug?.({
              type: 'rejected',
              candidateIndex,
              src: candidates[candidateIndex],
              error: message,
            });
            tryNextCandidate();
          });
      } catch (err) {
        options.onDebug?.({
          type: 'rejected',
          candidateIndex,
          src: candidates[candidateIndex],
          error: err instanceof Error ? err.message : String(err),
        });
        tryNextCandidate();
      }
    };

    beginAttempt();
  });
}
