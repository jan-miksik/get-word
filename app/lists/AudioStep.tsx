'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';

type AudioRow = {
  id: string;
  textKnown: string;
  textTarget: string;
  language: string;
  audioUrl: string | null;
  arweaveUrl?: string | null;
  arweaveUrls?: string[];
  storageRef?: string | null;
  reusableAudioUrl?: string | null;
  reusableArweaveUrl?: string | null;
  reusableArweaveUrls?: string[];
  reusableStorageRef?: string | null;
  reuseStatus?: 'unchecked' | 'checking' | 'found' | 'missing' | 'error';
  audioStatus: 'none' | 'pending' | 'ready' | 'failed';
  source?: 'dedup' | 'generated';
};

type AudioGenerationResult = {
  id: string;
  content_hash?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  size_bytes?: number;
  status: string;
  source?: string;
  error?: string;
};

type AudioReuseResult = {
  id: string;
  content_hash?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  size_bytes?: number;
  status: 'found' | 'missing' | 'error';
  linked?: boolean;
  error?: string;
};

type CachedAudio = {
  objectUrl: string;
  contentType: string;
  finalUrl: string;
  sizeBytes: number;
};

type AudioCheckResult = {
  status: 'ok' | 'failed';
  message: string;
  url?: string;
};

type DebugResponsePayload = {
  status: number;
  statusText: string;
  url: string;
  contentType: string;
  rawText: string;
  json: unknown;
};

const AUDIO_LOG_PREFIX = '[Wordlink audio]';

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

function logAudioStep(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(AUDIO_LOG_PREFIX, message);
    return;
  }
  console.info(AUDIO_LOG_PREFIX, message, details);
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

async function readDebugResponse(response: Response): Promise<DebugResponsePayload> {
  const contentType = response.headers.get('content-type') ?? '';
  const rawText = await response.text();
  let json: unknown = null;

  if (rawText.trim()) {
    try {
      json = JSON.parse(rawText);
    } catch (err) {
      console.warn(AUDIO_LOG_PREFIX, 'response was not valid JSON', {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType,
        bodyPreview: rawText.slice(0, 500),
        parseError: err instanceof Error ? err.message : err,
      });
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    contentType,
    rawText,
    json,
  };
}

function getErrorFromPayload(payload: DebugResponsePayload): string {
  if (
    payload.json &&
    typeof payload.json === 'object' &&
    'error' in payload.json &&
    typeof payload.json.error === 'string'
  ) {
    const detail =
      'detail' in payload.json && typeof payload.json.detail === 'string'
        ? payload.json.detail
        : null;
    const requestId =
      'request_id' in payload.json && typeof payload.json.request_id === 'string'
        ? payload.json.request_id
        : null;
    const code =
      'code' in payload.json && typeof payload.json.code === 'string'
        ? payload.json.code
        : null;
    const hint =
      'hint' in payload.json && typeof payload.json.hint === 'string'
        ? payload.json.hint
        : null;

    return [
      payload.json.error,
      detail ? `Detail: ${detail}` : null,
      code ? `Code: ${code}` : null,
      hint ? `Hint: ${hint}` : null,
      requestId ? `Request: ${requestId}` : null,
    ].filter(Boolean).join(' ');
  }

  const bodyPreview = payload.rawText.trim().slice(0, 160);
  return bodyPreview
    ? `Generation failed (${payload.status}): ${bodyPreview}`
    : `Generation failed (${payload.status} ${payload.statusText})`;
}

function formatLanguage(code: string): string {
  const names: Record<string, string> = {
    cs: 'Czech',
    cz: 'Czech',
    vi: 'Vietnamese',
    en: 'English',
  };
  return names[code] ?? code.toUpperCase();
}

function getLoadErrorMessage(error: unknown, fallbackUrl: string | null): AudioCheckResult {
  if (error instanceof AudioLoadError) {
    const firstAttempt = error.attempts[0];
    const failedUrl = firstAttempt?.requestedUrl ?? fallbackUrl ?? undefined;
    const reason =
      firstAttempt?.status
        ? `HTTP ${firstAttempt.status}`
        : firstAttempt?.error ?? error.message;
    return {
      status: 'failed',
      message: `Could not load ${failedUrl ?? 'audio file'} (${reason}).`,
      url: failedUrl,
    };
  }

  if (error && typeof error === 'object' && 'playbackUrl' in error) {
    const playbackUrl =
      typeof error.playbackUrl === 'string' ? error.playbackUrl : fallbackUrl ?? undefined;
    const reason =
      'mediaError' in error && typeof error.mediaError === 'string'
        ? error.mediaError
        : 'playback failed';
    return {
      status: 'failed',
      message: `Could not play ${playbackUrl ?? 'audio file'} (${reason}).`,
      url: playbackUrl,
    };
  }

  return {
    status: 'failed',
    message: error instanceof Error ? error.message : 'Audio file could not be loaded.',
    url: fallbackUrl ?? undefined,
  };
}

interface AudioStepProps {
  list: WordList;
  items: WordListItem[];
  googleUsage?: GoogleUsageResponse | null;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
  onUsageRefresh?: () => Promise<void>;
  onBack?: () => void;
}

export function AudioStep({
  list,
  items,
  googleUsage,
  onComplete,
  onSkip,
  onUsageRefresh,
  onBack,
}: AudioStepProps) {
  const [rows, setRows] = useState<AudioRow[]>(() =>
    items
      .filter((item) => item.textTarget)
      .map((item) => ({
        id: item.id,
        textKnown: item.textKnown,
        textTarget: item.textTarget!,
        language: list.languageTo,
        audioUrl: item.audioUrl ?? null,
        arweaveUrl: item.audioArweaveUrl ?? null,
        arweaveUrls: item.audioArweaveUrls ?? [],
        storageRef: item.audioStorageRef ?? null,
        reuseStatus: item.audioUrl ? 'found' : 'unchecked',
        audioStatus: item.audioStatus as AudioRow['audioStatus'],
      }))
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(() => new Set());
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, string>>({});
  const [checkingIds, setCheckingIds] = useState<Set<string>>(() => new Set());
  const [audioChecks, setAudioChecks] = useState<Record<string, AudioCheckResult>>({});
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, CachedAudio>>(new Map());
  const playQueueRef = useRef<string[]>([]);

  const readyCount = rows.filter((r) => r.audioStatus === 'ready').length;
  const needsGenCount = rows.filter((r) => r.audioStatus === 'none' || r.audioStatus === 'failed').length;
  const dedupCount = rows.filter((r) => r.source === 'dedup').length;
  const reusableCount = rows.filter((r) => r.reuseStatus === 'found' && r.audioStatus !== 'ready').length;
  const checkedFailureCount = Object.values(audioChecks).filter((check) => check.status === 'failed').length;
  const sourceLanguageLabel = formatLanguage(list.languageFrom);
  const targetLanguageLabel = formatLanguage(list.languageTo);
  const googleTtsUsage = googleUsage?.account.find((scope) => scope.scope === 'tts');
  const isGoogleTtsPaused = Boolean(googleTtsUsage?.paused);
  const googlePausedMessage = googleTtsUsage?.limit_message
    ?? 'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.';

  const clearCachedAudio = useCallback((audioUrl: string | null | undefined) => {
    if (!audioUrl) return;
    const cached = audioCacheRef.current.get(audioUrl);
    if (!cached) return;
    URL.revokeObjectURL(cached.objectUrl);
    audioCacheRef.current.delete(audioUrl);
    logAudioStep('cleared cached audio blob', { audioUrl, finalUrl: cached.finalUrl });
  }, []);

  const lookupReusableAudio = useCallback(async (targetRows: AudioRow[], link = false) => {
    if (targetRows.length === 0) return;

    setRows((prev) =>
      prev.map((row) =>
        targetRows.some((target) => target.id === row.id)
          ? { ...row, reuseStatus: 'checking' as const }
          : row,
      ),
    );

    try {
      const res = await listsApiFetch('/api/audio/reuse/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: targetRows.map((r) => ({
            id: r.id,
            text: r.textTarget,
            language: r.language,
          })),
          provider: 'google_tts',
          link,
        }),
      });

      const payload = await readDebugResponse(res);
      if (!res.ok) {
        throw new Error(getErrorFromPayload(payload));
      }
      if (!payload.json || typeof payload.json !== 'object') {
        throw new Error('Audio reuse lookup returned a non-JSON response');
      }

      const data = payload.json as { results?: unknown };
      const results = (Array.isArray(data.results) ? data.results : []) as AudioReuseResult[];
      const resultMap = new Map<string, AudioReuseResult>();
      for (const result of results) resultMap.set(result.id, result);

      setRows((prev) =>
        prev.map((row) => {
          const result = resultMap.get(row.id);
          if (!result) return row;

          if (result.status !== 'found') {
            return {
              ...row,
              reuseStatus: result.status === 'missing' ? 'missing' : 'error',
            };
          }

          const next = {
            ...row,
            reusableAudioUrl: result.audio_url ?? row.reusableAudioUrl ?? null,
            reusableArweaveUrl: result.arweave_url ?? row.reusableArweaveUrl ?? null,
            reusableArweaveUrls: result.arweave_urls ?? row.reusableArweaveUrls ?? [],
            reusableStorageRef: result.storage_ref ?? row.reusableStorageRef ?? null,
            reuseStatus: 'found' as const,
          };

          if (!link || !result.audio_url) return next;

          return {
            ...next,
            audioUrl: result.audio_url,
            arweaveUrl: result.arweave_url ?? next.arweaveUrl ?? null,
            arweaveUrls: result.arweave_urls ?? next.arweaveUrls ?? [],
            storageRef: result.storage_ref ?? next.storageRef ?? null,
            audioStatus: 'ready' as const,
            source: 'dedup' as const,
          };
        }),
      );
    } catch (err) {
      console.error(AUDIO_LOG_PREFIX, 'audio reuse lookup failed', err);
      setRows((prev) =>
        prev.map((row) =>
          targetRows.some((target) => target.id === row.id)
            ? { ...row, reuseStatus: 'error' as const }
            : row,
        ),
      );
      if (link) {
        setError(err instanceof Error ? err.message : 'Could not reuse existing audio');
      }
    }
  }, []);

  const preloadAudio = useCallback(async (row: AudioRow): Promise<string> => {
    if (!row.audioUrl) throw new Error('Audio URL is missing');

    const cached = audioCacheRef.current.get(row.audioUrl);
    if (cached) {
      logAudioStep('using cached audio blob', {
        itemId: row.id,
        audioUrl: row.audioUrl,
        finalUrl: cached.finalUrl,
        contentType: cached.contentType,
        sizeBytes: cached.sizeBytes,
      });
      return cached.objectUrl;
    }

    logAudioStep('preloading audio before playback', {
      itemId: row.id,
      text: row.textTarget,
      proxyUrl: row.audioUrl,
      arweaveUrl: row.arweaveUrl ?? null,
      arweaveUrls: row.arweaveUrls ?? [],
      storageRef: row.storageRef ?? null,
    });

    const candidateUrls = Array.from(new Set([
      row.audioUrl,
      ...(row.arweaveUrls ?? []),
      ...(row.arweaveUrl ? [row.arweaveUrl] : []),
    ].filter((url): url is string => Boolean(url))));

    let blob: Blob | null = null;
    let responseDetails: {
      itemId: string;
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
        console.warn(AUDIO_LOG_PREFIX, 'audio preload failed with network error', {
          itemId: row.id,
          requestedUrl: candidateUrl,
          error: err instanceof Error ? err.message : err,
        });
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      const contentLength = response.headers.get('content-length');
      const attemptDetails = {
        itemId: row.id,
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
        console.warn(AUDIO_LOG_PREFIX, 'audio preload failed with HTTP response', {
          ...attemptDetails,
          bodyPreview,
        });
        continue;
      }

      const lowerContentType = contentType.toLowerCase();
      const looksLikeAudio =
        lowerContentType.startsWith('audio/') ||
        lowerContentType.includes('mpeg') ||
        lowerContentType.includes('octet-stream') ||
        lowerContentType === '';

      if (!looksLikeAudio) {
        let bodyPreview = '';
        try {
          bodyPreview = (await response.clone().text()).slice(0, 240);
        } catch {
          bodyPreview = '[could not read response body]';
        }
        failedAttempts.push({ ...attemptDetails, bodyPreview });
        console.warn(AUDIO_LOG_PREFIX, 'audio preload returned a non-audio response', {
          ...attemptDetails,
          bodyPreview,
        });
        continue;
      }

      const candidateBlob = await response.blob();
      if (candidateBlob.size === 0) {
        failedAttempts.push({ ...attemptDetails, bodyPreview: '[empty audio response]' });
        console.warn(AUDIO_LOG_PREFIX, 'audio preload returned an empty file', attemptDetails);
        continue;
      }

      blob = candidateBlob;
      responseDetails = attemptDetails;
      break;
    }

    if (!blob || !responseDetails) {
      console.warn(AUDIO_LOG_PREFIX, 'all audio preload candidates failed', {
        itemId: row.id,
        proxyUrl: row.audioUrl,
        arweaveUrls: row.arweaveUrls ?? [],
        failedAttempts,
      });
      throw new AudioLoadError('Audio could not be loaded from any gateway', failedAttempts);
    }

    const objectUrl = URL.createObjectURL(blob);
    audioCacheRef.current.set(row.audioUrl, {
      objectUrl,
      contentType: blob.type || responseDetails.contentType || 'unknown',
      finalUrl: responseDetails.finalUrl,
      sizeBytes: blob.size,
    });
    logAudioStep('audio preloaded and cached', {
      ...responseDetails,
      blobType: blob.type,
      sizeBytes: blob.size,
    });

    return objectUrl;
  }, []);

  useEffect(() => {
    const unchecked = rows.filter(
      (row) => !row.audioUrl && row.textTarget && row.reuseStatus === 'unchecked',
    );
    if (unchecked.length === 0) return;
    void lookupReusableAudio(unchecked, false);
  }, [lookupReusableAudio, rows]);

  const markPlaybackFailed = useCallback((failedRow: AudioRow, details?: unknown) => {
    const checkResult = getLoadErrorMessage(details, failedRow.audioUrl);
    console.error(AUDIO_LOG_PREFIX, 'audio playback failed', {
      itemId: failedRow.id,
      text: failedRow.textTarget,
      proxyUrl: failedRow.audioUrl,
      arweaveUrl: failedRow.arweaveUrl ?? null,
      arweaveUrls: failedRow.arweaveUrls ?? [],
      storageRef: failedRow.storageRef ?? null,
      details,
    });
    setPlayingId(null);
    setPlaybackErrors((prev) => ({
      ...prev,
      [failedRow.id]: `${checkResult.message} Regenerate it to replace the stored file.`,
    }));
    setAudioChecks((prev) => ({
      ...prev,
      [failedRow.id]: checkResult,
    }));
    setRows((prev) =>
      prev.map((row) =>
        row.id === failedRow.id ? { ...row, audioStatus: 'failed' as const } : row,
      ),
    );
  }, []);

  const generateRows = useCallback(async (targetRows: AudioRow[], force = false) => {
    if (targetRows.length === 0) return;

    console.groupCollapsed(
      `${AUDIO_LOG_PREFIX} ${force ? 'regenerating' : 'generating'} ${targetRows.length} audio file(s)`,
    );
    console.table(targetRows.map((row) => ({
      itemId: row.id,
      text: row.textTarget,
      language: row.language,
      existingProxyUrl: row.audioUrl,
      existingArweaveUrl: row.arweaveUrl ?? null,
      existingArweaveUrls: row.arweaveUrls ?? [],
      existingStorageRef: row.storageRef ?? null,
    })));

    if (force) {
      setRegeneratingIds((prev) => new Set([...prev, ...targetRows.map((row) => row.id)]));
    } else {
      setGenerating(true);
    }
    setError(null);
    setProgress(0);
    setPlaybackErrors((prev) => {
      const next = { ...prev };
      for (const row of targetRows) delete next[row.id];
      return next;
    });
    for (const row of targetRows) clearCachedAudio(row.audioUrl);
    setRows((prev) =>
      prev.map((row) =>
        targetRows.some((target) => target.id === row.id)
          ? { ...row, audioStatus: 'pending' as const }
          : row,
      ),
    );

    try {
      const res = await listsApiFetch('/api/audio/generate/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: targetRows.map((r) => ({
            id: r.id,
            text: r.textTarget,
            language: r.language,
          })),
          provider: 'google_tts',
          force,
        }),
      });

      const payload = await readDebugResponse(res);
      if (!res.ok) {
        console.error(AUDIO_LOG_PREFIX, 'audio generation request failed', {
          status: payload.status,
          statusText: payload.statusText,
          url: payload.url,
          contentType: payload.contentType,
          json: payload.json,
          bodyPreview: payload.rawText.slice(0, 500),
        });
        throw new Error(getErrorFromPayload(payload));
      }

      if (!payload.json || typeof payload.json !== 'object') {
        console.error(AUDIO_LOG_PREFIX, 'audio generation returned a non-JSON success response', {
          status: payload.status,
          statusText: payload.statusText,
          url: payload.url,
          contentType: payload.contentType,
          bodyPreview: payload.rawText.slice(0, 500),
        });
        throw new Error('Audio generation returned a non-JSON response');
      }

      const data = payload.json as {
        results?: unknown;
        dedup_count?: number;
        generated_count?: number;
        quota_warning?: unknown;
      };
      const results = (Array.isArray(data.results) ? data.results : []) as AudioGenerationResult[];
      logAudioStep('audio generation response received', {
        dedupCount: data.dedup_count,
        generatedCount: data.generated_count,
        force,
        quotaWarning: data.quota_warning,
      });
      if (data.quota_warning) {
        console.warn(AUDIO_LOG_PREFIX, 'audio generated while quota tracking failed', data.quota_warning);
      }
      console.table(results.map((result) => ({
        itemId: result.id,
        status: result.status,
        source: result.source,
        proxyUrl: result.audio_url,
        arweaveUrl: result.arweave_url ?? null,
        arweaveUrls: result.arweave_urls ?? [],
        storageRef: result.storage_ref ?? null,
        sizeBytes: result.size_bytes ?? null,
        error: result.error ?? null,
      })));

      const resultMap = new Map<string, AudioGenerationResult>();
      for (const r of results) {
        resultMap.set(r.id, r);
      }

      setRows((prev) =>
        prev.map((row) => {
          const result = resultMap.get(row.id);
          if (!result) return row;
          return {
            ...row,
            audioUrl: result.audio_url ?? row.audioUrl,
            arweaveUrl: result.arweave_url ?? row.arweaveUrl ?? null,
            arweaveUrls: result.arweave_urls ?? row.arweaveUrls ?? [],
            storageRef: result.storage_ref ?? row.storageRef ?? null,
            audioStatus: result.status === 'ok' ? 'ready' : 'failed',
            source: result.source === 'dedup' || result.source === 'generated'
              ? result.source
              : undefined,
          };
        }),
      );
      setAudioChecks((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (result.status === 'ok') delete next[result.id];
        }
        return next;
      });

      // Surface a top-level error if every attempted item failed
      const attempted = results.filter((r) =>
        targetRows.some((t) => t.id === r.id)
      );
      if (attempted.length > 0 && attempted.every((r) => r.status === 'error')) {
        const firstError = attempted[0]?.error ?? 'Generation failed';
        setError(`Audio generation failed: ${firstError}`);
      }

      for (const result of attempted) {
        if (result.status !== 'ok' || !result.audio_url) continue;
        const sourceRow = targetRows.find((row) => row.id === result.id);
        if (!sourceRow) continue;
        void preloadAudio({
          ...sourceRow,
          audioUrl: result.audio_url,
          arweaveUrl: result.arweave_url ?? sourceRow.arweaveUrl ?? null,
          arweaveUrls: result.arweave_urls ?? sourceRow.arweaveUrls ?? [],
          storageRef: result.storage_ref ?? sourceRow.storageRef ?? null,
          audioStatus: 'ready',
          source: result.source === 'dedup' || result.source === 'generated'
            ? result.source
            : sourceRow.source,
        }).catch((err) => {
          console.warn(AUDIO_LOG_PREFIX, 'audio warm-cache failed after generation', {
            itemId: result.id,
            proxyUrl: result.audio_url,
            arweaveUrl: result.arweave_url ?? null,
            arweaveUrls: result.arweave_urls ?? [],
            storageRef: result.storage_ref ?? null,
            error: err instanceof Error ? err.message : err,
          });
        });
      }

      setProgress(100);
    } catch (err) {
      console.error(AUDIO_LOG_PREFIX, 'audio generation failed', err);
      setError(err instanceof Error ? err.message : 'Generation failed');
      setRows((prev) =>
        prev.map((row) =>
          targetRows.some((target) => target.id === row.id)
            ? { ...row, audioStatus: 'failed' as const }
            : row,
        ),
      );
    } finally {
      void onUsageRefresh?.();
      if (force) {
        setRegeneratingIds((prev) => {
          const next = new Set(prev);
          for (const row of targetRows) next.delete(row.id);
          return next;
        });
      } else {
        setGenerating(false);
      }
      console.groupEnd();
    }
  }, [clearCachedAudio, onUsageRefresh, preloadAudio]);

  const handleGenerateAll = useCallback(async () => {
    if (isGoogleTtsPaused) {
      setError(googlePausedMessage);
      return;
    }
    const toGenerate = rows.filter(
      (r) => r.audioStatus === 'none' || r.audioStatus === 'failed',
    );
    await generateRows(toGenerate, toGenerate.some((row) => row.audioUrl));
  }, [generateRows, googlePausedMessage, isGoogleTtsPaused, rows]);

  const checkRows = useCallback(async (targetRows: AudioRow[]) => {
    const checkableRows = targetRows.filter((row) => row.audioStatus === 'ready' && row.audioUrl);
    if (checkableRows.length === 0) return;

    setCheckingIds((prev) => new Set([...prev, ...checkableRows.map((row) => row.id)]));
    setPlaybackErrors((prev) => {
      const next = { ...prev };
      for (const row of checkableRows) delete next[row.id];
      return next;
    });

    const results = await Promise.all(
      checkableRows.map(async (row) => {
        try {
          await preloadAudio(row);
          return [
            row.id,
            {
              status: 'ok' as const,
              message: 'Audio file loaded successfully.',
              url: row.audioUrl ?? undefined,
            },
          ] as const;
        } catch (err) {
          return [row.id, getLoadErrorMessage(err, row.audioUrl)] as const;
        }
      }),
    );

    setAudioChecks((prev) => {
      const next = { ...prev };
      for (const [id, result] of results) {
        next[id] = result;
      }
      return next;
    });
    setRows((prev) =>
      prev.map((row) => {
        const result = results.find(([id]) => id === row.id)?.[1];
        return result?.status === 'failed'
          ? { ...row, audioStatus: 'failed' as const }
          : row;
      }),
    );
    setCheckingIds((prev) => {
      const next = new Set(prev);
      for (const row of checkableRows) next.delete(row.id);
      return next;
    });
  }, [preloadAudio]);

  const handleCheckAll = useCallback(async () => {
    await checkRows(rows);
  }, [checkRows, rows]);

  const handleCheckRow = useCallback(async (row: AudioRow) => {
    await checkRows([row]);
  }, [checkRows]);

  const handleUseExistingRow = useCallback(async (row: AudioRow) => {
    await lookupReusableAudio([row], true);
  }, [lookupReusableAudio]);

  const handleUseAllExisting = useCallback(async () => {
    await lookupReusableAudio(
      rows.filter((row) => row.reuseStatus === 'found' && row.audioStatus !== 'ready'),
      true,
    );
  }, [lookupReusableAudio, rows]);

  const handleRegenerateRow = useCallback(async (row: AudioRow) => {
    if (isGoogleTtsPaused) {
      setError(googlePausedMessage);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    playQueueRef.current = [];
    setPlayingId(null);
    await generateRows([row], true);
  }, [generateRows, googlePausedMessage, isGoogleTtsPaused]);

  const handleRegenerateAll = useCallback(async () => {
    if (isGoogleTtsPaused) {
      setError(googlePausedMessage);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    playQueueRef.current = [];
    setPlayingId(null);
    await generateRows(rows, true);
  }, [generateRows, googlePausedMessage, isGoogleTtsPaused, rows]);

  const handlePlaySingle = useCallback(async (row: AudioRow) => {
    if (!row.audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(row.id);
    let playbackUrl = row.audioUrl;
    try {
      playbackUrl = await preloadAudio(row);
    } catch (err) {
      console.warn(AUDIO_LOG_PREFIX, 'preload failed; trying original media URL in audio element', {
        itemId: row.id,
        proxyUrl: row.audioUrl,
        arweaveUrl: row.arweaveUrl ?? null,
        arweaveUrls: row.arweaveUrls ?? [],
        error: err instanceof Error ? err.message : err,
      });
    }

    const audio = new Audio(playbackUrl);
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => markPlaybackFailed(row, {
      playbackUrl,
      mediaError: getMediaErrorLabel(audio.error),
      mediaMessage: audio.error?.message ?? null,
      networkState: audio.networkState,
      readyState: audio.readyState,
    });
    audio.oncanplaythrough = () => logAudioStep('audio can play through', {
      itemId: row.id,
      playbackUrl,
      duration: Number.isFinite(audio.duration) ? audio.duration : null,
      readyState: audio.readyState,
    });
    audio.play().catch((err) => markPlaybackFailed(row, {
      playbackUrl,
      playError: err instanceof Error ? err.message : err,
      mediaError: getMediaErrorLabel(audio.error),
      mediaMessage: audio.error?.message ?? null,
      networkState: audio.networkState,
      readyState: audio.readyState,
    }));
  }, [markPlaybackFailed, preloadAudio]);

  const handlePlayAll = useCallback(() => {
    const ready = rows.filter((r) => r.audioStatus === 'ready' && r.audioUrl);
    if (ready.length === 0) return;
    playQueueRef.current = ready.map((r) => r.id);
    void playNext();
  }, [rows]);

  async function playNext() {
    const nextId = playQueueRef.current.shift();
    if (!nextId) {
      setPlayingId(null);
      return;
    }
    const row = rows.find((r) => r.id === nextId);
    if (!row?.audioUrl) {
      playNext();
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    setPlayingId(row.id);
    let playbackUrl = row.audioUrl;
    try {
      playbackUrl = await preloadAudio(row);
    } catch (err) {
      console.warn(AUDIO_LOG_PREFIX, 'preload failed during play all; trying original media URL', {
        itemId: row.id,
        proxyUrl: row.audioUrl,
        arweaveUrl: row.arweaveUrl ?? null,
        arweaveUrls: row.arweaveUrls ?? [],
        error: err instanceof Error ? err.message : err,
      });
    }
    const audio = new Audio(playbackUrl);
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.onended = () => {
      setTimeout(() => void playNext(), 1500);
    };
    audio.onerror = () => {
      markPlaybackFailed(row, {
        playbackUrl,
        mediaError: getMediaErrorLabel(audio.error),
        mediaMessage: audio.error?.message ?? null,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      void playNext();
    };
    audio.play().catch((err) => {
      markPlaybackFailed(row, {
        playbackUrl,
        playError: err instanceof Error ? err.message : err,
        mediaError: getMediaErrorLabel(audio.error),
        mediaMessage: audio.error?.message ?? null,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      void playNext();
    });
  }

  const handlePause = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    playQueueRef.current = [];
    setPlayingId(null);
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      for (const cached of audioCacheRef.current.values()) {
        URL.revokeObjectURL(cached.objectUrl);
      }
      audioCacheRef.current.clear();
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text">Audio Generation</h2>
          <p className="text-sm text-text-soft mt-0.5">
            {readyCount} of {rows.length} have audio
            {dedupCount > 0 && (
              <span className="text-done ml-1">({dedupCount} reused)</span>
            )}
            {reusableCount > 0 && (
              <span className="text-accent ml-1">({reusableCount} existing available)</span>
            )}
            {checkedFailureCount > 0 && (
              <span className="text-danger ml-1">({checkedFailureCount} load issue{checkedFailureCount === 1 ? '' : 's'})</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-border-subtle text-text-soft text-sm hover:text-text transition-colors"
          onClick={onSkip}
        >
          Skip audio
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-background-elevated border border-border-subtle">
        {reusableCount > 0 && (
          <button
            type="button"
            disabled={generating || regeneratingIds.size > 0}
            className="px-4 py-1.5 rounded-lg bg-done text-background text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            onClick={handleUseAllExisting}
          >
            Use existing ({reusableCount})
          </button>
        )}

        <button
          type="button"
          disabled={generating || needsGenCount === 0 || isGoogleTtsPaused}
          className="px-4 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handleGenerateAll}
        >
          {generating ? 'Generating...' : `Generate audio (${needsGenCount})`}
        </button>

        {rows.length > 0 && (
          <button
            type="button"
            disabled={generating || regeneratingIds.size > 0 || rows.length === 0 || isGoogleTtsPaused}
            className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-xs hover:bg-background/50 transition-colors disabled:opacity-50"
            onClick={handleRegenerateAll}
          >
            {readyCount > 0 ? 'Generate new all' : 'Generate all new'}
          </button>
        )}

        {readyCount > 0 && (
          <>
            <button
              type="button"
              disabled={checkingIds.size > 0}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-xs hover:bg-background/50 transition-colors disabled:opacity-50"
              onClick={handleCheckAll}
            >
              {checkingIds.size > 0 ? 'Checking...' : 'Check audio'}
            </button>

            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-xs hover:bg-background/50 transition-colors"
              onClick={playingId ? handlePause : handlePlayAll}
            >
              {playingId ? 'Pause' : 'Play all'}
            </button>
          </>
        )}
      </div>

      {isGoogleTtsPaused && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {googlePausedMessage}
        </div>
      )}

      {/* Progress bar */}
      {generating && (
        <div className="mb-4 h-1.5 rounded-full bg-border-subtle overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 text-danger text-sm">{error}</div>
      )}

      {/* Word list with audio controls */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="divide-y divide-border-subtle max-h-[60vh] overflow-y-auto">
          {rows.map((row) => {
            const isPlaying = playingId === row.id;
            const isRegenerating = regeneratingIds.has(row.id);
            const isChecking = checkingIds.has(row.id);
            const playbackError = playbackErrors[row.id];
            const audioCheck = audioChecks[row.id];
            const canPlay = row.audioStatus === 'ready' && Boolean(row.audioUrl);
            const canUseExisting = row.reuseStatus === 'found' && row.audioStatus !== 'ready';
            return (
              <div
                key={row.id}
                className={`flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center ${
                  isPlaying ? 'bg-accent/10 border-l-2 border-l-accent' : ''
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {/* Play button */}
                  <button
                    type="button"
                    disabled={!canPlay}
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      canPlay
                        ? isPlaying
                          ? 'bg-accent text-background'
                          : 'bg-accent/10 text-accent hover:bg-accent/20'
                        : 'bg-border-subtle text-text-soft'
                    }`}
                    onClick={() => handlePlaySingle(row)}
                    title="Play audio"
                  >
                    {isPlaying ? (
                      <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="2" y="2" width="3" height="8" fill="currentColor" rx="0.5" />
                        <rect x="7" y="2" width="3" height="8" fill="currentColor" rx="0.5" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 12 12">
                        <path d="M3 1.5v9l7.5-4.5L3 1.5z" fill="currentColor" />
                      </svg>
                    )}
                  </button>

                  {/* Word text */}
                  <div className="min-w-0 flex-1">
                    <span className="block text-[11px] uppercase tracking-wide text-text-soft">
                      {sourceLanguageLabel} → {targetLanguageLabel}
                    </span>
                    <span className="block text-sm text-text break-words">
                      <span className="text-text">{row.textKnown}</span>
                      <span className="mx-1.5 text-text-soft">-</span>
                      <span className="text-accent">{row.textTarget}</span>
                    </span>
                    {canUseExisting && (
                      <span className="mt-1 block text-xs text-done">
                        Existing audio is available for this text.
                      </span>
                    )}
                    {row.reuseStatus === 'checking' && (
                      <span className="mt-1 block text-xs text-text-soft">
                        Looking for reusable audio...
                      </span>
                    )}
                    {audioCheck?.status === 'ok' && (
                      <span className="mt-1 block text-xs text-done truncate">
                        Loaded OK: {audioCheck.url}
                      </span>
                    )}
                    {(playbackError || audioCheck?.status === 'failed') && (
                      <span className="mt-1 block text-xs text-danger break-words">
                        {playbackError ?? audioCheck?.message}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0 sm:justify-end">
                  {canUseExisting && (
                    <button
                      type="button"
                      disabled={generating || row.reuseStatus === 'checking'}
                      className="shrink-0 px-2.5 py-1 rounded-md border border-done/40 bg-done/10 text-xs text-done hover:bg-done/20 transition-colors disabled:opacity-50"
                      onClick={() => handleUseExistingRow(row)}
                    >
                      Use existing
                    </button>
                  )}

                  {canPlay && (
                    <button
                      type="button"
                      disabled={isChecking}
                      className="shrink-0 px-2.5 py-1 rounded-md border border-border-subtle text-xs text-text-soft hover:text-text hover:bg-background/50 transition-colors disabled:opacity-50"
                      onClick={() => handleCheckRow(row)}
                    >
                      {isChecking ? 'Checking...' : 'Check'}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={generating || isRegenerating || !row.textTarget || isGoogleTtsPaused}
                    className="shrink-0 px-2.5 py-1 rounded-md border border-border-subtle text-xs text-text-soft hover:text-text hover:bg-background/50 transition-colors disabled:opacity-50"
                    onClick={() => handleRegenerateRow(row)}
                  >
                    {isRegenerating ? 'Generating...' : canPlay ? 'Generate new' : 'Generate'}
                  </button>

                  {/* Status indicator */}
                  <span className="shrink-0 text-xs">
                    {row.audioStatus === 'ready' && (
                      <span className="text-done">{row.source === 'dedup' ? 'reused' : 'ready'}</span>
                    )}
                    {row.audioStatus === 'pending' && (
                      <span className="text-fresh">pending</span>
                    )}
                    {row.audioStatus === 'failed' && (
                      <span className="text-danger">failed</span>
                    )}
                    {row.audioStatus === 'none' && (
                      <span className="text-text-soft">no audio</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-border-subtle">
        {onBack ? (
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
            onClick={onBack}
          >
            ← Back
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
            onClick={onSkip}
          >
            Skip audio
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium hover:bg-accent-strong transition-colors"
            onClick={onComplete}
          >
            Confirm & finish
          </button>
        </div>
      </div>
    </div>
  );
}
