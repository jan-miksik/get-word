'use client';

import { apiUrl } from '@/features/shared/http/api-runtime';
import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { getCachedPlayableAudioUrl } from '@/lib/audio-availability';
import { hashFromAudioUrl } from '@/lib/audio-clip-cache';
import { getWarmedClipUrl } from '@/lib/audio-clip-playback';
import { withAudioDebugParam } from '@/lib/audio-debug';
import { isAudioNetworkOffline } from '@/lib/audio-network-policy';
import { getPrefetchedAudioUrl } from '@/lib/audio-prefetch';

export type AudioPlaybackResult = {
  ok: boolean;
  interrupted: boolean;
  /** Rate the clip was started at: 1 for normal, 0.5 for the slow replay. */
  rate: number;
};

export const SLOW_PLAYBACK_RATE = 0.5;

/**
 * How long after a press the next press on the same clip still counts as a
 * replay. Long enough to hear a word and decide to listen again, short enough
 * that coming back to a card later starts at normal speed.
 */
const REPEAT_WINDOW_MS = 12_000;

let lastPressKey: string | null = null;
let lastPressAt = 0;
let lastPressRate = 1;

function repeatKeyFor(audioSrc: string | string[] | null): string {
  return Array.isArray(audioSrc) ? audioSrc.join('|') : String(audioSrc);
}

/**
 * Pressing play again on the same clip alternates normal → slow → normal,
 * the familiar "tap twice to slow it down" behaviour of language apps.
 */
function resolvePlaybackRate(audioSrc: string | string[] | null): number {
  const key = repeatKeyFor(audioSrc);
  const now = Date.now();
  const isRepeat = key === lastPressKey && now - lastPressAt <= REPEAT_WINDOW_MS;
  const rate = isRepeat && lastPressRate === 1 ? SLOW_PLAYBACK_RATE : 1;

  lastPressKey = key;
  lastPressAt = now;
  lastPressRate = rate;
  return rate;
}

export function resetAudioRepeatState(): void {
  lastPressKey = null;
  lastPressAt = 0;
  lastPressRate = 1;
}

function applyPlaybackRate(audio: HTMLAudioElement, rate: number): void {
  // `load()` resets playbackRate to defaultPlaybackRate, so set both — the
  // fallback candidates re-load the same element.
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  // Keep the voice recognisable at half speed instead of dropping an octave.
  audio.preservesPitch = true;
}

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
  // Bytes held in the shared clip store, looked up synchronously so the tap
  // that triggered playback still counts as user activation. A clip generated
  // moments ago is only here — the proxy would spend seconds on gateways it
  // cannot serve from yet.
  const localClipCandidates = sources
    .map(hashFromAudioUrl)
    .filter((hash): hash is string => Boolean(hash))
    .map(getWarmedClipUrl)
    .filter((src): src is string => Boolean(src));

  return Array.from(
    new Set(
      [
        ...localClipCandidates,
        ...downloadedCandidates,
        ...warmedCandidates,
        ...gatewayCandidates,
      ],
    ),
    // An `<audio>` src is resolved against the page, not through `apiFetch`, so
    // an app-relative `/api/audio/[hash]` points at the native bundle's own
    // origin and never loads. No-op on the web, where the API is same-origin.
    toPlayableUrl,
  );
}

function toPlayableUrl(candidate: string): string {
  return candidate.startsWith('/') ? apiUrl(candidate) : candidate;
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
  options: { onDebug?: AudioPlaybackDebugHandler; slowOnRepeat?: boolean } = {},
): Promise<AudioPlaybackResult> {
  const candidates = getPlaybackCandidates(audioSrc);
  if (candidates.length === 0) {
    options.onDebug?.({ type: 'empty' });
    return Promise.resolve({ ok: false, interrupted: false, rate: 1 });
  }

  const rate = options.slowOnRepeat === false ? 1 : resolvePlaybackRate(audioSrc);

  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }

  const audio = new Audio(candidates[0]);
  audio.preload = 'auto';
  applyPlaybackRate(audio, rate);
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
        done({ ok: false, interrupted: true, rate });
        return;
      }
      if (isAudioNetworkOffline()) {
        options.onDebug?.({
          type: 'offline',
          candidateIndex,
          src: candidates[candidateIndex],
        });
        done({ ok: false, interrupted: false, rate });
        return;
      }

      candidateIndex += 1;
      if (candidateIndex >= candidates.length) {
        options.onDebug?.({
          type: 'exhausted',
          candidateIndex: candidateIndex - 1,
          src: candidates[candidateIndex - 1],
        });
        done({ ok: false, interrupted: false, rate });
        return;
      }

      audio.src = candidates[candidateIndex];
      audio.load();
      applyPlaybackRate(audio, rate);
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
            applyPlaybackRate(audio, rate);
            done({ ok: true, interrupted: false, rate });
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
              done({ ok: false, interrupted: true, rate });
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
