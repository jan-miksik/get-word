'use client';

// Audio playback + cache hook for the lists wizard's AudioStep.
//
// Owns the blob cache (fetched audio kept as object URLs so retries are
// instant and so playback can fall through Arweave gateway candidates), the
// single-shot/queue playback machinery, and the per-row playback error map.
// The component still owns row data and generation; the hook just exposes
// `playSingle/playAll/pause/clearCachedAudio/preloadAudio` and the playback
// state needed by the JSX (`playingId`, `playbackErrors`).
//
// When a *linked* audio URL fails, the row's `audioStatus` must flip to
// 'failed' — that lives in the component, so the hook calls
// `onLinkedSourceFailed(rowId)` for it.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioRow, AudioSourceCandidate } from '@/features/lists/audio-step/rows';
import type { TranslateFn } from '@/features/lists/audio-step/api';
import { reportAudioStorageResponse, withAudioDebugParam } from '@/lib/audio-debug';

type CachedAudio = {
  objectUrl: string;
  contentType: string;
  finalUrl: string;
  sizeBytes: number;
};

type QueuedAudio = {
  rowId: string;
  source: AudioSourceCandidate;
};

const AUDIO_LOG_PREFIX = '[Get Word audio]';

class AudioLoadError extends Error {
  constructor(
    message: string,
    readonly attempts: {
      requestedUrl: string;
      finalUrl?: string;
      status?: number;
      ok?: boolean;
      contentType?: string;
      contentLength?: string | null;
      bodyPreview?: string;
      error?: string;
    }[],
  ) {
    super(message);
    this.name = 'AudioLoadError';
  }
}

function getMediaErrorLabel(error: MediaError | null): string {
  if (!error) return 'unknown';
  switch (error.code) {
    case 1:
      return 'MEDIA_ERR_ABORTED';
    case 2:
      return 'MEDIA_ERR_NETWORK';
    case 3:
      return 'MEDIA_ERR_DECODE';
    case 4:
      return 'MEDIA_ERR_SRC_NOT_SUPPORTED';
    default:
      return `MEDIA_ERR_${error.code}`;
  }
}

function getLoadErrorMessage(error: unknown, fallbackUrl: string | null, t: TranslateFn): string {
  if (error instanceof AudioLoadError) {
    const firstAttempt = error.attempts[0];
    const failedUrl = firstAttempt?.requestedUrl ?? fallbackUrl ?? undefined;
    const reason =
      firstAttempt?.status
        ? `HTTP ${firstAttempt.status}`
        : firstAttempt?.error ?? error.message;
    return t('lists.audioLoadFailed', {
      file: failedUrl ?? t('lists.audioFile'),
      reason,
    });
  }

  if (error && typeof error === 'object' && 'playbackUrl' in error) {
    const playbackUrl =
      typeof error.playbackUrl === 'string' ? error.playbackUrl : fallbackUrl ?? undefined;
    const reason =
      'mediaError' in error && typeof error.mediaError === 'string'
        ? error.mediaError
        : t('lists.audioPlaybackGenericReason');
    return t('lists.audioPlaybackFailed', {
      file: playbackUrl ?? t('lists.audioFile'),
      reason,
    });
  }

  return error instanceof Error ? error.message : t('lists.audioFileLoadFailed');
}

function isAppAudioProxyUrl(url: string): boolean {
  if (url.startsWith('/api/audio/')) return true;
  try {
    const parsed = new URL(
      url,
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
    );
    return parsed.pathname.startsWith('/api/audio/');
  } catch {
    return false;
  }
}

export type UseAudioPlaybackDeps = {
  rows: AudioRow[];
  t: TranslateFn;
  onLinkedSourceFailed: (rowId: string) => void;
};

export function useAudioPlayback({ rows, t, onLinkedSourceFailed }: UseAudioPlaybackDeps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, CachedAudio>>(new Map());
  const playQueueRef = useRef<QueuedAudio[]>([]);
  const playNextRef = useRef<(() => void) | null>(null);

  const clearCachedAudio = useCallback((audioUrl: string | null | undefined) => {
    if (!audioUrl) return;
    const cached = audioCacheRef.current.get(audioUrl);
    if (!cached) return;
    URL.revokeObjectURL(cached.objectUrl);
    audioCacheRef.current.delete(audioUrl);
  }, []);

  const getPlaybackCandidateUrls = useCallback((source: AudioSourceCandidate): string[] => {
    const cached = audioCacheRef.current.get(source.audioUrl);
    return Array.from(
      new Set([
        ...(cached ? [cached.objectUrl] : []),
        withAudioDebugParam(source.audioUrl),
        ...source.arweaveUrls,
        ...(source.arweaveUrl ? [source.arweaveUrl] : []),
      ]),
    );
  }, []);

  const preloadAudio = useCallback(
    async (rowId: string, source: AudioSourceCandidate): Promise<string> => {
      void rowId;
      const cached = audioCacheRef.current.get(source.audioUrl);
      if (cached) return cached.objectUrl;

      const candidateUrls = isAppAudioProxyUrl(source.audioUrl)
        ? [withAudioDebugParam(source.audioUrl)]
        : Array.from(
            new Set([
              withAudioDebugParam(source.audioUrl),
              ...source.arweaveUrls,
              ...(source.arweaveUrl ? [source.arweaveUrl] : []),
            ]),
          );

      let blob: Blob | null = null;
      let responseDetails: {
        requestedUrl: string;
        finalUrl: string;
        status: number;
        ok: boolean;
        contentType: string;
        contentLength: string | null;
      } | null = null;
      const failedAttempts: AudioLoadError['attempts'] = [];

      for (const candidateUrl of candidateUrls) {
        let response: Response;
        try {
          response = await fetch(candidateUrl, {
            cache: 'force-cache',
            headers: {
              Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1',
            },
          });
        } catch (err) {
          failedAttempts.push({
            requestedUrl: candidateUrl,
            error: err instanceof Error ? err.message : 'Network error',
          });
          continue;
        }

        const contentType = response.headers.get('content-type') ?? '';
        const contentLength = response.headers.get('content-length');
        reportAudioStorageResponse(response, candidateUrl);
        const attemptDetails = {
          requestedUrl: candidateUrl,
          finalUrl: response.url,
          status: response.status,
          ok: response.ok,
          contentType,
          contentLength,
        };

        if (!response.ok) {
          let bodyPreview = '';
          try {
            bodyPreview = (await response.clone().text()).slice(0, 240);
          } catch {
            bodyPreview = '[could not read response body]';
          }
          failedAttempts.push({ ...attemptDetails, bodyPreview });
          continue;
        }

        const normalizedContentType = contentType.toLowerCase();
        const looksLikeAudio =
          normalizedContentType.startsWith('audio/') ||
          normalizedContentType.includes('mpeg') ||
          normalizedContentType.includes('octet-stream') ||
          normalizedContentType === '';

        if (!looksLikeAudio) {
          let bodyPreview = '';
          try {
            bodyPreview = (await response.clone().text()).slice(0, 240);
          } catch {
            bodyPreview = '[could not read response body]';
          }
          failedAttempts.push({ ...attemptDetails, bodyPreview });
          continue;
        }

        const candidateBlob = await response.blob();
        if (candidateBlob.size === 0) {
          failedAttempts.push({ ...attemptDetails, bodyPreview: '[empty audio response]' });
          continue;
        }

        blob = candidateBlob;
        responseDetails = attemptDetails;
        break;
      }

      if (!blob || !responseDetails) {
        throw new AudioLoadError(t('lists.audioGatewayLoadFailed'), failedAttempts);
      }

      const objectUrl = URL.createObjectURL(blob);
      audioCacheRef.current.set(source.audioUrl, {
        objectUrl,
        contentType: blob.type || responseDetails.contentType || 'unknown',
        finalUrl: responseDetails.finalUrl,
        sizeBytes: blob.size,
      });

      return objectUrl;
    },
    [t],
  );

  const markPlaybackFailed = useCallback(
    (row: AudioRow, source: AudioSourceCandidate, details?: unknown) => {
      const baseMessage = getLoadErrorMessage(details, source.audioUrl, t);
      const message = source.kind === 'linked'
        ? t('lists.audioLinkedFailureAction', { message: baseMessage })
        : t('lists.audioReusableFailureAction', { message: baseMessage });

      console.error(AUDIO_LOG_PREFIX, 'audio playback failed', {
        itemId: row.id,
        text: row.audioText,
        sourceKind: source.kind,
        audioUrl: source.audioUrl,
        arweaveUrl: source.arweaveUrl ?? null,
        arweaveUrls: source.arweaveUrls,
        storageRef: source.storageRef ?? null,
        details,
      });

      setPlayingId(null);
      setPlaybackErrors((prev) => ({ ...prev, [row.id]: message }));

      if (source.kind === 'linked') {
        onLinkedSourceFailed(row.id);
      }
    },
    [onLinkedSourceFailed, t],
  );

  const playAudioWithFallback = useCallback(
    (
      row: AudioRow,
      source: AudioSourceCandidate,
      candidateUrls: string[],
      onEnded: () => void,
      onFailed: (details: unknown) => void,
    ) => {
      const attempts: {
        playbackUrl: string;
        mediaError?: string;
        mediaMessage?: string | null;
        networkState?: number;
        readyState?: number;
        playError?: unknown;
      }[] = [];

      const tryCandidate = (index: number) => {
        const playbackUrl = candidateUrls[index];
        if (!playbackUrl) {
          onFailed({ attempts });
          return;
        }

        const audio = new Audio(playbackUrl);
        let handledFailure = false;
        audio.preload = 'auto';
        audioRef.current = audio;
        audio.onended = onEnded;

        const handleCandidateFailed = (playError?: unknown) => {
          if (handledFailure || audioRef.current !== audio) return;
          handledFailure = true;
          attempts.push({
            playbackUrl,
            ...(playError ? { playError } : {}),
            mediaError: getMediaErrorLabel(audio.error),
            mediaMessage: audio.error?.message ?? null,
            networkState: audio.networkState,
            readyState: audio.readyState,
          });
          tryCandidate(index + 1);
        };

        audio.onerror = () => handleCandidateFailed();
        audio.play().catch((err) => {
          handleCandidateFailed(err instanceof Error ? err.message : err);
        });
      };

      void row;
      void source;
      tryCandidate(0);
    },
    [],
  );

  // Keep a ref to the latest rows so the queue advancer can resolve them
  // without re-creating playNext each render (which would otherwise tear
  // down audio.onended bindings mid-queue).
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const schedulePlayNext = useCallback(() => {
    window.setTimeout(() => {
      playNextRef.current?.();
    }, 1200);
  }, []);

  const playNext = useCallback(async () => {
    let next: QueuedAudio | undefined;
    let row: AudioRow | undefined;
    while (!row) {
      next = playQueueRef.current.shift();
      if (!next) {
        setPlayingId(null);
        return;
      }
      row = rowsRef.current.find((candidate) => candidate.id === next?.rowId);
    }

    if (audioRef.current) audioRef.current.pause();

    setPlayingId(row.id);
    playAudioWithFallback(
      row,
      next.source,
      getPlaybackCandidateUrls(next.source),
      schedulePlayNext,
      (details) => {
        markPlaybackFailed(row, next.source, details);
        playNextRef.current?.();
      },
    );
  }, [getPlaybackCandidateUrls, markPlaybackFailed, playAudioWithFallback, schedulePlayNext]);

  useEffect(() => {
    playNextRef.current = () => {
      void playNext();
    };
  }, [playNext]);

  const playSingle = useCallback(
    async (row: AudioRow, source: AudioSourceCandidate) => {
      if (audioRef.current) audioRef.current.pause();

      setPlayingId(row.id);
      playAudioWithFallback(
        row,
        source,
        getPlaybackCandidateUrls(source),
        () => setPlayingId(null),
        (details) => markPlaybackFailed(row, source, details),
      );
    },
    [getPlaybackCandidateUrls, markPlaybackFailed, playAudioWithFallback],
  );

  const playQueue = useCallback(
    (queue: QueuedAudio[]) => {
      if (queue.length === 0) return;
      playQueueRef.current = queue;
      void playNext();
    },
    [playNext],
  );

  const pause = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    playQueueRef.current = [];
    setPlayingId(null);
  }, []);

  const resetForReload = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    playQueueRef.current = [];
    setPlayingId(null);
    setPlaybackErrors({});
  }, []);

  // Unmount cleanup: stop audio and revoke every cached object URL.
  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      if (audioRef.current) audioRef.current.pause();
      for (const cached of cache.values()) {
        URL.revokeObjectURL(cached.objectUrl);
      }
      cache.clear();
    };
  }, []);

  return {
    playingId,
    playbackErrors,
    setPlaybackErrors,
    clearCachedAudio,
    preloadAudio,
    playSingle,
    playQueue,
    pause,
    resetForReload,
  } as const;
}
