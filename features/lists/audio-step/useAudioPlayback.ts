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

  const clearCachedAudio = useCallback((audioUrl: string | null | undefined) => {
    if (!audioUrl) return;
    const cached = audioCacheRef.current.get(audioUrl);
    if (!cached) return;
    URL.revokeObjectURL(cached.objectUrl);
    audioCacheRef.current.delete(audioUrl);
  }, []);

  const preloadAudio = useCallback(
    async (rowId: string, source: AudioSourceCandidate): Promise<string> => {
      void rowId;
      const cached = audioCacheRef.current.get(source.audioUrl);
      if (cached) return cached.objectUrl;

      const candidateUrls = isAppAudioProxyUrl(source.audioUrl)
        ? [source.audioUrl]
        : Array.from(
            new Set([
              source.audioUrl,
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

  // Keep a ref to the latest rows so the queue advancer can resolve them
  // without re-creating playNext each render (which would otherwise tear
  // down audio.onended bindings mid-queue).
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const playNext = useCallback(async () => {
    const next = playQueueRef.current.shift();
    if (!next) {
      setPlayingId(null);
      return;
    }

    const row = rowsRef.current.find((candidate) => candidate.id === next.rowId);
    if (!row) {
      void playNext();
      return;
    }

    if (audioRef.current) audioRef.current.pause();

    setPlayingId(row.id);
    let playbackUrl = next.source.audioUrl;
    try {
      playbackUrl = await preloadAudio(row.id, next.source);
    } catch (err) {
      markPlaybackFailed(row, next.source, err);
      void playNext();
      return;
    }

    const audio = new Audio(playbackUrl);
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.onended = () => {
      setTimeout(() => void playNext(), 1200);
    };
    audio.onerror = () => {
      markPlaybackFailed(row, next.source, {
        playbackUrl,
        mediaError: getMediaErrorLabel(audio.error),
        mediaMessage: audio.error?.message ?? null,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      void playNext();
    };
    audio.play().catch((err) => {
      markPlaybackFailed(row, next.source, {
        playbackUrl,
        playError: err instanceof Error ? err.message : err,
        mediaError: getMediaErrorLabel(audio.error),
        mediaMessage: audio.error?.message ?? null,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      void playNext();
    });
  }, [markPlaybackFailed, preloadAudio]);

  const playSingle = useCallback(
    async (row: AudioRow, source: AudioSourceCandidate) => {
      if (audioRef.current) audioRef.current.pause();

      setPlayingId(row.id);
      let playbackUrl = source.audioUrl;
      try {
        playbackUrl = await preloadAudio(row.id, source);
      } catch (err) {
        markPlaybackFailed(row, source, err);
        return;
      }

      const audio = new Audio(playbackUrl);
      audio.preload = 'auto';
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () =>
        markPlaybackFailed(row, source, {
          playbackUrl,
          mediaError: getMediaErrorLabel(audio.error),
          mediaMessage: audio.error?.message ?? null,
          networkState: audio.networkState,
          readyState: audio.readyState,
        });
      audio.play().catch((err) => {
        markPlaybackFailed(row, source, {
          playbackUrl,
          playError: err instanceof Error ? err.message : err,
          mediaError: getMediaErrorLabel(audio.error),
          mediaMessage: audio.error?.message ?? null,
          networkState: audio.networkState,
          readyState: audio.readyState,
        });
      });
    },
    [markPlaybackFailed, preloadAudio],
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
