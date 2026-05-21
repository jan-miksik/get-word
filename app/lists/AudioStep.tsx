'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';
import { GoogleUsageHint } from './GoogleUsageHint';

type AudioSide = 'target' | 'known';

type AudioVariant = {
  assetId: string;
  contentHash?: string;
  audioUrl: string | null;
  arweaveUrl?: string | null;
  arweaveUrls: string[];
  storageRef?: string | null;
  provider?: string | null;
  sizeBytes?: number;
};

type AudioRow = {
  id: string;
  audioAssetId: string | null;
  knownText: string;
  targetText: string;
  audioText: string;
  supportingText: string;
  language: string;
  audioUrl: string | null;
  arweaveUrl?: string | null;
  arweaveUrls: string[];
  storageRef?: string | null;
  reusableOptions: AudioVariant[];
  selectedReusableAssetId: string | null;
  reuseStatus: 'unchecked' | 'checking' | 'found' | 'missing' | 'error';
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

type AudioReuseMatch = {
  asset_id: string;
  content_hash?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  provider?: string | null;
  size_bytes?: number;
};

type AudioReuseResult = {
  id: string;
  content_hash?: string;
  asset_id?: string;
  selected_asset_id?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  size_bytes?: number;
  status: 'found' | 'missing' | 'error';
  linked?: boolean;
  error?: string;
  matches?: AudioReuseMatch[];
};

type CachedAudio = {
  objectUrl: string;
  contentType: string;
  finalUrl: string;
  sizeBytes: number;
};

type DebugResponsePayload = {
  status: number;
  statusText: string;
  url: string;
  contentType: string;
  rawText: string;
  json: unknown;
};

type AudioSourceCandidate = {
  kind: 'linked' | 'reusable';
  audioUrl: string;
  arweaveUrl?: string | null;
  arweaveUrls: string[];
  storageRef?: string | null;
};

type QueuedAudio = {
  rowId: string;
  source: AudioSourceCandidate;
};

type TtsLanguageOption = {
  code: string;
  name: string;
  ttsVoices?: string[];
  preferredVoice?: string | null;
};

const AUDIO_LOG_PREFIX = '[Get Word audio]';
const GOOGLE_TTS_VOICE_STORAGE_PREFIX = 'wordlink-list-google-tts-voice';

function readStorageValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore private browsing or blocked storage; the current session still works.
  }
}

function getGoogleVoiceStorageKey(languageCode: string): string {
  return `${GOOGLE_TTS_VOICE_STORAGE_PREFIX}:${languageCode.toLowerCase()}`;
}

function readStoredGoogleVoiceId(languageCode: string): string {
  return readStorageValue(getGoogleVoiceStorageKey(languageCode)) || 'default';
}

function writeStoredGoogleVoiceId(languageCode: string, voiceId: string): void {
  writeStorageValue(getGoogleVoiceStorageKey(languageCode), voiceId);
}

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
    ? `Generování selhalo (${payload.status}): ${bodyPreview}`
    : `Generování selhalo (${payload.status} ${payload.statusText})`;
}

function formatLanguage(code: string): string {
  const names: Record<string, string> = {
    cs: 'čeština',
    cz: 'čeština',
    vi: 'vietnamština',
    en: 'angličtina',
  };
  return names[code] ?? code.toUpperCase();
}

function getBaseLanguage(code: string): string {
  return code.toLowerCase().split('-')[0];
}

function getLoadErrorMessage(error: unknown, fallbackUrl: string | null): string {
  if (error instanceof AudioLoadError) {
    const firstAttempt = error.attempts[0];
    const failedUrl = firstAttempt?.requestedUrl ?? fallbackUrl ?? undefined;
    const reason =
      firstAttempt?.status
        ? `HTTP ${firstAttempt.status}`
        : firstAttempt?.error ?? error.message;
    return `Nepodařilo se načíst ${failedUrl ?? 'zvukový soubor'} (${reason}).`;
  }

  if (error && typeof error === 'object' && 'playbackUrl' in error) {
    const playbackUrl =
      typeof error.playbackUrl === 'string' ? error.playbackUrl : fallbackUrl ?? undefined;
    const reason =
      'mediaError' in error && typeof error.mediaError === 'string'
        ? error.mediaError
        : 'přehrávání selhalo';
    return `Nepodařilo se přehrát ${playbackUrl ?? 'zvukový soubor'} (${reason}).`;
  }

  return error instanceof Error ? error.message : 'Zvukový soubor se nepodařilo načíst.';
}

function toAudioVariant(match: AudioReuseMatch): AudioVariant {
  return {
    assetId: match.asset_id,
    contentHash: match.content_hash,
    audioUrl: match.audio_url,
    arweaveUrl: match.arweave_url ?? null,
    arweaveUrls: match.arweave_urls ?? [],
    storageRef: match.storage_ref ?? null,
    provider: match.provider ?? null,
    sizeBytes: match.size_bytes,
  };
}

function buildAudioRows(items: WordListItem[], list: WordList, audioSide: AudioSide): AudioRow[] {
  const isKnownSide = audioSide === 'known';

  return items
    .filter((item) => Boolean(isKnownSide ? item.textKnown : item.textTarget))
    .map((item) => ({
      id: item.id,
      audioAssetId: isKnownSide ? item.knownAudioAssetId ?? null : item.audioAssetId ?? null,
      knownText: item.textKnown,
      targetText: item.textTarget ?? '',
      audioText: isKnownSide ? item.textKnown : item.textTarget ?? '',
      supportingText: isKnownSide ? item.textTarget ?? '' : item.textKnown,
      language: isKnownSide ? list.languageFrom : list.languageTo,
      audioUrl: isKnownSide ? item.knownAudioUrl ?? null : item.audioUrl ?? null,
      arweaveUrl: isKnownSide ? item.knownAudioArweaveUrl ?? null : item.audioArweaveUrl ?? null,
      arweaveUrls: isKnownSide ? item.knownAudioArweaveUrls ?? [] : item.audioArweaveUrls ?? [],
      storageRef: isKnownSide ? item.knownAudioStorageRef ?? null : item.audioStorageRef ?? null,
      reusableOptions: [],
      selectedReusableAssetId: isKnownSide ? item.knownAudioAssetId ?? null : item.audioAssetId ?? null,
      reuseStatus: 'unchecked',
      audioStatus: (isKnownSide ? item.knownAudioStatus : item.audioStatus ?? 'none') as AudioRow['audioStatus'],
    }));
}

function getSelectedReusableOption(row: AudioRow): AudioVariant | null {
  if (row.reusableOptions.length === 0) return null;
  if (!row.selectedReusableAssetId) return row.reusableOptions[0] ?? null;
  return (
    row.reusableOptions.find((option) => option.assetId === row.selectedReusableAssetId)
    ?? row.reusableOptions[0]
    ?? null
  );
}

function getPreviewSource(row: AudioRow): AudioSourceCandidate | null {
  if (row.audioStatus === 'ready' && row.audioUrl) {
    return {
      kind: 'linked',
      audioUrl: row.audioUrl,
      arweaveUrl: row.arweaveUrl ?? null,
      arweaveUrls: row.arweaveUrls ?? [],
      storageRef: row.storageRef ?? null,
    };
  }

  const selectedOption = getSelectedReusableOption(row);
  if (!selectedOption?.audioUrl) return null;

  return {
    kind: 'reusable',
    audioUrl: selectedOption.audioUrl,
    arweaveUrl: selectedOption.arweaveUrl ?? null,
    arweaveUrls: selectedOption.arweaveUrls,
    storageRef: selectedOption.storageRef ?? null,
  };
}

interface AudioStepProps {
  list: WordList;
  items: WordListItem[];
  audioSide: AudioSide;
  title: string;
  googleUsage?: GoogleUsageResponse | null;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
  onUsageRefresh?: () => Promise<void>;
  onBack?: () => void;
}

export function AudioStep({
  list,
  items,
  audioSide,
  title,
  googleUsage,
  onComplete,
  onSkip,
  onUsageRefresh,
  onBack,
}: AudioStepProps) {
  const activeLanguageCode = audioSide === 'known' ? list.languageFrom : list.languageTo;
  const activeLanguageLabel = audioSide === 'known'
    ? formatLanguage(list.languageFrom)
    : formatLanguage(list.languageTo);
  const [rows, setRows] = useState<AudioRow[]>(() => buildAudioRows(items, list, audioSide));
  const [generating, setGenerating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(() => new Set());
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const [selectedGoogleVoiceId, setSelectedGoogleVoiceId] = useState(
    () => readStoredGoogleVoiceId(activeLanguageCode),
  );
  const [loadingVoices, setLoadingVoices] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, CachedAudio>>(new Map());
  const playQueueRef = useRef<QueuedAudio[]>([]);
  const didInitializeVoiceRef = useRef(false);

  const readyCount = rows.filter((row) => row.audioStatus === 'ready').length;
  const needsGenCount = rows.filter((row) => row.audioStatus === 'none' || row.audioStatus === 'failed').length;
  const dedupCount = rows.filter((row) => row.source === 'dedup').length;
  const reusableCount = rows.filter(
    (row) => row.reusableOptions.length > 0 && row.audioStatus !== 'ready',
  ).length;
  const selectedReusableCount = rows.filter((row) => {
    const selected = getSelectedReusableOption(row);
    return Boolean(selected?.audioUrl) && row.audioStatus !== 'ready';
  }).length;
  const googleVoiceIdForRequest =
    selectedGoogleVoiceId === 'default' ? undefined : selectedGoogleVoiceId;
  const googleTtsUsage = googleUsage?.account.find((scope) => scope.scope === 'tts');
  const isGoogleTtsPaused = Boolean(googleTtsUsage?.paused);
  const googlePausedMessage = googleTtsUsage?.limit_message
    ?? 'Tento účet dosáhl bezplatného limitu Google API. Ozvěte se nám kvůli navýšení, nebo použijte vlastní API klíče.';

  useEffect(() => {
    setRows(buildAudioRows(items, list, audioSide));
    setPlaybackErrors({});
    setError(null);
    setSelectedGoogleVoiceId(readStoredGoogleVoiceId(activeLanguageCode));
    didInitializeVoiceRef.current = false;
    if (audioRef.current) audioRef.current.pause();
    setPlayingId(null);
    playQueueRef.current = [];
  }, [activeLanguageCode, audioSide, items, list]);

  useEffect(() => {
    let cancelled = false;

    async function loadVoices() {
      setLoadingVoices(true);
      try {
        const res = await fetch('/api/languages');
        if (!res.ok) throw new Error('Failed to load Google TTS voices');
        const data = await res.json();
        const languages = Array.isArray(data.languages)
          ? data.languages as TtsLanguageOption[]
          : [];
        const activeBase = getBaseLanguage(activeLanguageCode);
        const language = languages.find((candidate) =>
          candidate.code.toLowerCase() === activeLanguageCode.toLowerCase()
          || getBaseLanguage(candidate.code) === activeBase
        );
        const voices = Array.from(new Set(language?.ttsVoices ?? []));
        if (cancelled) return;
        setVoiceOptions(voices);
        setSelectedGoogleVoiceId((current) =>
          current !== 'default' && voices.includes(current) ? current : 'default'
        );
      } catch (err) {
        if (cancelled) return;
        console.warn(AUDIO_LOG_PREFIX, 'could not load Google TTS voices', err);
        setVoiceOptions([]);
        setSelectedGoogleVoiceId('default');
      } finally {
        if (!cancelled) setLoadingVoices(false);
      }
    }

    void loadVoices();

    return () => {
      cancelled = true;
    };
  }, [activeLanguageCode]);

  useEffect(() => {
    if (!didInitializeVoiceRef.current) {
      didInitializeVoiceRef.current = true;
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        row.audioStatus === 'ready'
          ? row
          : {
              ...row,
              reusableOptions: [],
              selectedReusableAssetId: row.audioAssetId,
              reuseStatus: 'unchecked' as const,
            },
      ),
    );
  }, [selectedGoogleVoiceId]);

  const clearCachedAudio = useCallback((audioUrl: string | null | undefined) => {
    if (!audioUrl) return;
    const cached = audioCacheRef.current.get(audioUrl);
    if (!cached) return;
    URL.revokeObjectURL(cached.objectUrl);
    audioCacheRef.current.delete(audioUrl);
    logAudioStep('cleared cached audio blob', { audioUrl, finalUrl: cached.finalUrl });
  }, []);

  const preloadAudio = useCallback(async (rowId: string, source: AudioSourceCandidate): Promise<string> => {
    const cached = audioCacheRef.current.get(source.audioUrl);
    if (cached) {
      logAudioStep('using cached audio blob', {
        itemId: rowId,
        audioUrl: source.audioUrl,
        finalUrl: cached.finalUrl,
        contentType: cached.contentType,
        sizeBytes: cached.sizeBytes,
      });
      return cached.objectUrl;
    }

    const candidateUrls = Array.from(new Set([
      source.audioUrl,
      ...source.arweaveUrls,
      ...(source.arweaveUrl ? [source.arweaveUrl] : []),
    ]));

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
        normalizedContentType.startsWith('audio/')
        || normalizedContentType.includes('mpeg')
        || normalizedContentType.includes('octet-stream')
        || normalizedContentType === '';

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
      throw new AudioLoadError('Zvuk se nepodařilo načíst z žádné brány', failedAttempts);
    }

    const objectUrl = URL.createObjectURL(blob);
    audioCacheRef.current.set(source.audioUrl, {
      objectUrl,
      contentType: blob.type || responseDetails.contentType || 'unknown',
      finalUrl: responseDetails.finalUrl,
      sizeBytes: blob.size,
    });

    return objectUrl;
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
          items: targetRows.map((row) => ({
            id: row.id,
            text: row.audioText,
            language: row.language,
            selected_asset_id: row.selectedReusableAssetId ?? undefined,
          })),
          provider: 'google_tts',
          ...(googleVoiceIdForRequest ? { voice_id: googleVoiceIdForRequest } : {}),
          audio_field: audioSide,
          link,
        }),
      });

      const payload = await readDebugResponse(res);
      if (!res.ok) {
        throw new Error(getErrorFromPayload(payload));
      }
      if (!payload.json || typeof payload.json !== 'object') {
        throw new Error('Vyhledání znovupoužitelného zvuku vrátilo odpověď, která není JSON');
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
              reusableOptions: [],
              reuseStatus: result.status === 'missing' ? 'missing' : 'error',
            };
          }

          const reusableOptions = (result.matches ?? [])
            .map(toAudioVariant)
            .filter((option) => Boolean(option.audioUrl));
          const selectedReusableAssetId =
            result.selected_asset_id
            ?? row.audioAssetId
            ?? row.selectedReusableAssetId
            ?? reusableOptions[0]?.assetId
            ?? null;
          const selectedOption =
            reusableOptions.find((option) => option.assetId === selectedReusableAssetId)
            ?? reusableOptions[0]
            ?? null;

          const nextRow: AudioRow = {
            ...row,
            reusableOptions,
            selectedReusableAssetId,
            reuseStatus: reusableOptions.length > 0 ? 'found' : 'missing',
          };

          if (!link || !selectedOption?.audioUrl) {
            return nextRow;
          }

          return {
            ...nextRow,
            audioAssetId: selectedOption.assetId,
            audioUrl: selectedOption.audioUrl,
            arweaveUrl: selectedOption.arweaveUrl ?? null,
            arweaveUrls: selectedOption.arweaveUrls,
            storageRef: selectedOption.storageRef ?? null,
            audioStatus: 'ready',
            source: 'dedup',
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
        setError(err instanceof Error ? err.message : 'Existující zvuk se nepodařilo znovu použít');
      }
    }
  }, [audioSide, googleVoiceIdForRequest]);

  useEffect(() => {
    const uncheckedRows = rows.filter((row) => row.audioText && row.reuseStatus === 'unchecked');
    if (uncheckedRows.length === 0) return;
    void lookupReusableAudio(uncheckedRows, false);
  }, [lookupReusableAudio, rows]);

  const markPlaybackFailed = useCallback((
    row: AudioRow,
    source: AudioSourceCandidate,
    details?: unknown,
  ) => {
    const baseMessage = getLoadErrorMessage(details, source.audioUrl);
    const message = source.kind === 'linked'
      ? `${baseMessage} Vygenerujte nový soubor, který ho nahradí.`
      : `${baseMessage} Zkuste jinou uloženou verzi nebo vygenerujte novou.`;

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
    setPlaybackErrors((prev) => ({
      ...prev,
      [row.id]: message,
    }));

    if (source.kind === 'linked') {
      setRows((prev) =>
        prev.map((candidate) =>
          candidate.id === row.id ? { ...candidate, audioStatus: 'failed' as const } : candidate,
        ),
      );
    }
  }, []);

  const generateRows = useCallback(async (targetRows: AudioRow[], force = false) => {
    if (targetRows.length === 0) return;

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
          items: targetRows.map((row) => ({
            id: row.id,
            text: row.audioText,
            language: row.language,
          })),
          provider: 'google_tts',
          ...(googleVoiceIdForRequest ? { voice_id: googleVoiceIdForRequest } : {}),
          audio_field: audioSide,
          force,
        }),
      });

      const payload = await readDebugResponse(res);
      if (!res.ok) {
        throw new Error(getErrorFromPayload(payload));
      }
      if (!payload.json || typeof payload.json !== 'object') {
        throw new Error('Generování zvuku vrátilo odpověď, která není JSON');
      }

      const data = payload.json as {
        results?: unknown;
        quota_warning?: unknown;
      };
      const results = (Array.isArray(data.results) ? data.results : []) as AudioGenerationResult[];
      const resultMap = new Map<string, AudioGenerationResult>();
      for (const result of results) resultMap.set(result.id, result);

      setRows((prev) =>
        prev.map((row) => {
          const result = resultMap.get(row.id);
          if (!result) return row;

          return {
            ...row,
            audioAssetId: result.status === 'ok' ? row.audioAssetId : row.audioAssetId,
            audioUrl: result.audio_url ?? row.audioUrl,
            arweaveUrl: result.arweave_url ?? row.arweaveUrl ?? null,
            arweaveUrls: result.arweave_urls ?? row.arweaveUrls,
            storageRef: result.storage_ref ?? row.storageRef ?? null,
            audioStatus: result.status === 'ok' ? 'ready' : 'failed',
            source: result.source === 'dedup' || result.source === 'generated'
              ? result.source
              : undefined,
          };
        }),
      );

      const attempted = results.filter((result) =>
        targetRows.some((target) => target.id === result.id),
      );
      if (attempted.length > 0 && attempted.every((result) => result.status === 'error')) {
        setError(`Generování zvuku selhalo: ${attempted[0]?.error ?? 'Generování selhalo'}`);
      }

      for (const result of attempted) {
        if (result.status !== 'ok' || !result.audio_url) continue;
        const sourceRow = targetRows.find((row) => row.id === result.id);
        if (!sourceRow) continue;
        void preloadAudio(result.id, {
          kind: 'linked',
          audioUrl: result.audio_url,
          arweaveUrl: result.arweave_url ?? null,
          arweaveUrls: result.arweave_urls ?? [],
          storageRef: result.storage_ref ?? null,
        }).catch(() => {});
      }

      if (data.quota_warning) {
        console.warn(AUDIO_LOG_PREFIX, 'audio generated while quota tracking failed', data.quota_warning);
      }

      setProgress(100);
    } catch (err) {
      console.error(AUDIO_LOG_PREFIX, 'audio generation failed', err);
      setError(err instanceof Error ? err.message : 'Generování selhalo');
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
    }
  }, [audioSide, clearCachedAudio, googleVoiceIdForRequest, onUsageRefresh, preloadAudio]);

  const handleGenerateAll = useCallback(async () => {
    if (isGoogleTtsPaused) {
      setError(googlePausedMessage);
      return;
    }
    const toGenerate = rows.filter((row) => row.audioStatus === 'none' || row.audioStatus === 'failed');
    await generateRows(toGenerate, toGenerate.some((row) => Boolean(row.audioUrl)));
  }, [generateRows, googlePausedMessage, isGoogleTtsPaused, rows]);

  const handleUseAllExisting = useCallback(async () => {
    const reusableRows = rows.filter((row) => {
      const selected = getSelectedReusableOption(row);
      return Boolean(selected?.audioUrl) && row.audioStatus !== 'ready';
    });
    await lookupReusableAudio(reusableRows, true);
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


  const playRow = useCallback(async (row: AudioRow, source: AudioSourceCandidate) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingId(row.id);
    let playbackUrl = source.audioUrl;
    try {
      playbackUrl = await preloadAudio(row.id, source);
    } catch (err) {
      console.warn(AUDIO_LOG_PREFIX, 'preload failed; trying direct media URL', {
        itemId: row.id,
        sourceKind: source.kind,
        audioUrl: source.audioUrl,
        error: err instanceof Error ? err.message : err,
      });
    }

    const audio = new Audio(playbackUrl);
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => markPlaybackFailed(row, source, {
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
  }, [markPlaybackFailed, preloadAudio]);

  const playNext = useCallback(async () => {
    const next = playQueueRef.current.shift();
    if (!next) {
      setPlayingId(null);
      return;
    }

    const row = rows.find((candidate) => candidate.id === next.rowId);
    if (!row) {
      void playNext();
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingId(row.id);
    let playbackUrl = next.source.audioUrl;
    try {
      playbackUrl = await preloadAudio(row.id, next.source);
    } catch (err) {
      console.warn(AUDIO_LOG_PREFIX, 'preload failed during play all; trying direct media URL', {
        itemId: row.id,
        sourceKind: next.source.kind,
        audioUrl: next.source.audioUrl,
        error: err instanceof Error ? err.message : err,
      });
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
  }, [markPlaybackFailed, preloadAudio, rows]);

  const handlePlaySingle = useCallback(async (row: AudioRow) => {
    const source = getPreviewSource(row);
    if (!source) return;
    await playRow(row, source);
  }, [playRow]);

  const handlePlayAll = useCallback(() => {
    const queue = rows.flatMap((row) => {
      const source = getPreviewSource(row);
      return source ? [{ rowId: row.id, source }] : [];
    });
    if (queue.length === 0) return;
    playQueueRef.current = queue;
    void playNext();
  }, [playNext, rows]);

  const handlePause = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    playQueueRef.current = [];
    setPlayingId(null);
  }, []);

  const handleReusableSelectionChange = useCallback(async (row: AudioRow, assetId: string) => {
    const updatedRow = { ...row, selectedReusableAssetId: assetId };
    setRows((prev) =>
      prev.map((r) => r.id === row.id ? updatedRow : r),
    );
    if (getSelectedReusableOption(updatedRow)?.audioUrl) {
      await lookupReusableAudio([updatedRow], true);
    }
  }, [lookupReusableAudio]);

  const handleGoogleVoiceChange = useCallback((voiceId: string) => {
    setSelectedGoogleVoiceId(voiceId);
    writeStoredGoogleVoiceId(activeLanguageCode, voiceId);
  }, [activeLanguageCode]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  }, [onComplete]);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      for (const cached of audioCacheRef.current.values()) {
        URL.revokeObjectURL(cached.objectUrl);
      }
      audioCacheRef.current.clear();
    };
  }, []);

  const subtitle = useMemo(() => {
    const parts = [`Připraveno ${readyCount} z ${rows.length}`];
    if (dedupCount > 0) parts.push(`${dedupCount} znovu použito`);
    if (reusableCount > 0) parts.push(`${reusableCount} s uloženými verzemi`);
    return parts.join(' • ');
  }, [dedupCount, readyCount, reusableCount, rows.length]);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="mt-0.5 text-sm text-text-soft">
            {subtitle} pro jazyk {activeLanguageLabel}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft transition-colors hover:text-text"
          onClick={onSkip}
        >
          Přeskočit
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-border-subtle bg-background-elevated p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[14rem] flex-col gap-1 text-xs text-text-soft">
            Hlas Google
            <select
              value={selectedGoogleVoiceId}
              onChange={(event) => handleGoogleVoiceChange(event.target.value)}
              disabled={generating || regeneratingIds.size > 0 || loadingVoices}
              className="rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-text disabled:opacity-50"
            >
              <option value="default">
                {loadingVoices ? 'Načítám hlasy...' : 'Výchozí hlas Google'}
              </option>
              {voiceOptions.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </label>

          {selectedReusableCount > 0 && (
            <button
              type="button"
              disabled={generating || regeneratingIds.size > 0}
              className="rounded-lg bg-done px-4 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handleUseAllExisting}
            >
              Použít vybrané existující ({selectedReusableCount})
            </button>
          )}

          <button
            type="button"
            disabled={generating || needsGenCount === 0 || isGoogleTtsPaused}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
            onClick={handleGenerateAll}
          >
            {generating ? 'Generuji...' : `Vygenerovat zvuk (${needsGenCount})`}
          </button>

          {rows.some((row) => Boolean(getPreviewSource(row))) && (
            <button
              type="button"
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text transition-colors hover:bg-background/50"
              onClick={playingId ? handlePause : handlePlayAll}
            >
              {playingId ? 'Pozastavit' : 'Přehrát vše'}
            </button>
          )}
        </div>
        {googleTtsUsage && <GoogleUsageHint scope={googleTtsUsage} />}
      </div>

      {isGoogleTtsPaused && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {googlePausedMessage}
        </div>
      )}

      {generating && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <div className="max-h-[60vh] divide-y divide-border-subtle overflow-y-auto">
          {rows.map((row) => {
            const isPlaying = playingId === row.id;
            const isRegenerating = regeneratingIds.has(row.id);
            const playbackError = playbackErrors[row.id];
            const previewSource = getPreviewSource(row);
            const canPlay = Boolean(previewSource);
            const selectedReusable = getSelectedReusableOption(row);

            return (
              <div
                key={row.id}
                className={`flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center ${
                  isPlaying ? 'border-l-2 border-l-accent bg-accent/10' : ''
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <button
                    type="button"
                    disabled={!canPlay}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                      canPlay
                        ? isPlaying
                          ? 'bg-accent text-background'
                          : 'bg-accent/10 text-accent hover:bg-accent/20'
                        : 'bg-border-subtle text-text-soft'
                    }`}
                    onClick={() => void handlePlaySingle(row)}
                    title="Přehrát zvuk"
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

                  <div className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-text">
                      {row.audioText}
                    </span>
                    <span className="block break-words text-xs text-text-soft">
                      {row.supportingText}
                    </span>
                    {playbackError && (
                      <span className="mt-1 block break-words text-xs text-danger">
                        {playbackError}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0 sm:justify-end">
                  {row.reusableOptions.length > 1 && (
                    <select
                      value={row.selectedReusableAssetId ?? selectedReusable?.assetId ?? ''}
                      onChange={(event) => void handleReusableSelectionChange(row, event.target.value)}
                      disabled={generating || row.reuseStatus === 'checking'}
                      className="max-w-[10rem] rounded-md border border-border-subtle bg-background px-2.5 py-1 text-xs text-text disabled:opacity-50"
                    >
                      {row.reusableOptions.map((option, index) => (
                        <option key={option.assetId} value={option.assetId}>
                          {`Verze ${index + 1} (${row.reusableOptions.length})`}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    disabled={generating || isRegenerating || !row.audioText || isGoogleTtsPaused}
                    className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-soft transition-colors hover:bg-background/50 hover:text-text disabled:opacity-50"
                    onClick={() => void handleRegenerateRow(row)}
                  >
                    {isRegenerating ? 'Generuji...' : row.audioStatus === 'ready' ? 'Vygenerovat nový' : 'Vygenerovat'}
                  </button>

                  <span className="shrink-0 text-xs">
                    {row.audioStatus === 'ready' && (
                      <span className="text-done">{row.source === 'dedup' ? 'znovu použito' : 'hotovo'}</span>
                    )}
                    {row.audioStatus === 'pending' && (
                      <span className="text-fresh">čeká</span>
                    )}
                    {row.audioStatus === 'failed' && (
                      <span className="text-danger">selhalo</span>
                    )}
                    {row.audioStatus === 'none' && (
                      <span className="text-text-soft">bez zvuku</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-between gap-2 border-t border-border-subtle pt-4">
        {onBack ? (
          <button
            type="button"
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text transition-colors hover:bg-background-elevated"
            onClick={onBack}
          >
            ← Zpět
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text transition-colors hover:bg-background-elevated"
            onClick={onSkip}
          >
            Přeskočit
          </button>
          <button
            type="button"
            disabled={completing}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-70"
            onClick={() => void handleComplete()}
          >
            {completing && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {audioSide === 'known' ? 'Potvrdit' : 'Pokračovat'}
          </button>
        </div>
      </div>
    </div>
  );
}
