import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import {
  chunkArray,
  getErrorFromPayload,
  readDebugResponse,
  type AudioGenerationResult,
  type TranslateFn,
} from './api';
import type { AudioRow, AudioSide, AudioSourceCandidate } from './rows';

const AUDIO_LOG_PREFIX = '[Get Word audio]';
const AUDIO_GENERATE_BATCH_SIZE = 200;

type UseAudioGenerationWorkflowOptions = {
  rows: AudioRow[];
  setRows: Dispatch<SetStateAction<AudioRow[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setPlaybackErrors: Dispatch<SetStateAction<Record<string, string>>>;
  clearCachedAudio: (audioUrl: string | null | undefined) => void;
  preloadAudio: (rowId: string, source: AudioSourceCandidate) => Promise<string>;
  pause: () => void;
  audioSide: AudioSide;
  googleVoiceIdForRequest: string | undefined;
  isGoogleTtsPaused: boolean;
  googlePausedMessage: string;
  onUsageRefresh?: () => Promise<void>;
  t: TranslateFn;
};

export function useAudioGenerationWorkflow({
  rows,
  setRows,
  setError,
  setPlaybackErrors,
  clearCachedAudio,
  preloadAudio,
  pause,
  audioSide,
  googleVoiceIdForRequest,
  isGoogleTtsPaused,
  googlePausedMessage,
  onUsageRefresh,
  t,
}: UseAudioGenerationWorkflowOptions) {
  const [generating, setGenerating] = useState(false);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState(0);

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
      const batches = chunkArray(targetRows, AUDIO_GENERATE_BATCH_SIZE);
      const allResults: AudioGenerationResult[] = [];
      let completed = 0;

      for (const batchRows of batches) {
        const res = await listsApiFetch('/api/audio/generate/batch', {
          method: 'POST',
          body: JSON.stringify({
            items: batchRows.map((row) => ({
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
          throw new Error(getErrorFromPayload(payload, t));
        }
        if (!payload.json || typeof payload.json !== 'object') {
          throw new Error(t('lists.audioGenerateInvalidResponse'));
        }

        const data = payload.json as {
          results?: unknown;
          quota_warning?: unknown;
        };
        const results = (Array.isArray(data.results) ? data.results : []) as AudioGenerationResult[];
        allResults.push(...results);

        const resultMap = new Map<string, AudioGenerationResult>();
        for (const result of results) resultMap.set(result.id, result);

        setRows((prev) =>
          prev.map((row) => {
            const result = resultMap.get(row.id);
            if (!result) return row;

            return {
              ...row,
              audioAssetId: row.audioAssetId,
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

        for (const result of results) {
          if (result.status !== 'ok' || !result.audio_url) continue;
          void preloadAudio(result.id, {
            kind: 'linked',
            audioUrl: result.audio_url,
            arweaveUrl: result.arweave_url ?? null,
            arweaveUrls: result.arweave_urls ?? [],
            storageRef: result.storage_ref ?? null,
          }).catch(() => {});
        }

        completed += batchRows.length;
        setProgress(Math.round((completed / targetRows.length) * 100));
      }

      const attempted = allResults.filter((result) =>
        targetRows.some((target) => target.id === result.id),
      );
      if (attempted.length > 0 && attempted.every((result) => result.status === 'error')) {
        setError(t('lists.audioGenerateFailed', {
          message: attempted[0]?.error ?? t('lists.audioGenerateGenericFailed'),
        }));
      }

      setProgress(100);
    } catch (err) {
      console.error(AUDIO_LOG_PREFIX, 'audio generation failed', err);
      setError(err instanceof Error ? err.message : t('lists.audioGenerateGenericFailed'));
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
  }, [
    audioSide,
    clearCachedAudio,
    googleVoiceIdForRequest,
    onUsageRefresh,
    preloadAudio,
    setError,
    setPlaybackErrors,
    setRows,
    t,
  ]);

  const generateAll = useCallback(async () => {
    if (isGoogleTtsPaused) {
      setError(googlePausedMessage);
      return;
    }
    const toGenerate = rows.filter((row) => row.audioStatus === 'none' || row.audioStatus === 'failed');
    await generateRows(toGenerate, toGenerate.some((row) => Boolean(row.audioUrl)));
  }, [generateRows, googlePausedMessage, isGoogleTtsPaused, rows, setError]);

  const regenerateRow = useCallback(async (row: AudioRow) => {
    if (isGoogleTtsPaused) {
      setError(googlePausedMessage);
      return;
    }
    pause();
    await generateRows([row], true);
  }, [generateRows, googlePausedMessage, isGoogleTtsPaused, pause, setError]);

  return {
    generating,
    regeneratingIds,
    progress,
    generateAll,
    regenerateRow,
  };
}
