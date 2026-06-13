import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import {
  chunkArray,
  getErrorFromPayload,
  readDebugResponse,
  type AudioReuseResult,
  type TranslateFn,
} from './api';
import {
  getSelectedReusableOption,
  toAudioVariant,
  type AudioRow,
  type AudioSide,
} from './rows';

const AUDIO_LOG_PREFIX = '[Get Word audio]';
const AUDIO_REUSE_BATCH_SIZE = 200;

type UseReusableAudioLookupOptions = {
  rows: AudioRow[];
  setRows: Dispatch<SetStateAction<AudioRow[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  audioSide: AudioSide;
  resolveVoice: (text: string) => string | undefined;
  selectionKey: string;
  t: TranslateFn;
};

export function useReusableAudioLookup({
  rows,
  setRows,
  setError,
  audioSide,
  resolveVoice,
  selectionKey,
  t,
}: UseReusableAudioLookupOptions) {
  const didInitializeVoiceRef = useRef(false);

  const lookupReusableAudio = useCallback(async (targetRows: AudioRow[], link = false) => {
    if (targetRows.length === 0) return;
    const targetIds = new Set(targetRows.map((row) => row.id));

    setRows((prev) =>
      prev.map((row) =>
        targetIds.has(row.id)
          ? { ...row, reuseStatus: 'checking' as const }
          : row,
      ),
    );

    try {
      const results: AudioReuseResult[] = [];
      for (const batchRows of chunkArray(targetRows, AUDIO_REUSE_BATCH_SIZE)) {
        const res = await listsApiFetch('/api/audio/reuse/batch', {
          method: 'POST',
          body: JSON.stringify({
            items: batchRows.map((row) => {
              const voiceId = resolveVoice(row.audioText);
              return {
                id: row.id,
                text: row.audioText,
                language: row.language,
                selected_asset_id: row.selectedReusableAssetId ?? undefined,
                ...(voiceId ? { voice_id: voiceId } : {}),
              };
            }),
            provider: 'google_tts',
            audio_field: audioSide,
            link,
          }),
        });

        const payload = await readDebugResponse(res);
        if (!res.ok) {
          throw new Error(getErrorFromPayload(payload, t));
        }
        if (!payload.json || typeof payload.json !== 'object') {
          throw new Error(t('lists.audioReuseInvalidResponse'));
        }

        const data = payload.json as { results?: unknown };
        results.push(...((Array.isArray(data.results) ? data.results : []) as AudioReuseResult[]));
      }

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
          targetIds.has(row.id)
            ? { ...row, reuseStatus: 'error' as const }
            : row,
        ),
      );
      if (link) {
        setError(err instanceof Error ? err.message : t('lists.audioUseExistingFailed'));
      }
    }
  }, [audioSide, resolveVoice, setError, setRows, t]);

  useEffect(() => {
    if (!didInitializeVoiceRef.current) {
      didInitializeVoiceRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
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
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectionKey, setRows]);

  useEffect(() => {
    const uncheckedRows = rows.filter((row) => row.audioText && row.reuseStatus === 'unchecked');
    if (uncheckedRows.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      void lookupReusableAudio(uncheckedRows, false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [lookupReusableAudio, rows]);

  const useAllExisting = useCallback(async () => {
    const reusableRows = rows.filter((row) => {
      const selected = getSelectedReusableOption(row);
      return Boolean(selected?.audioUrl) && row.audioStatus !== 'ready';
    });
    await lookupReusableAudio(reusableRows, true);
  }, [lookupReusableAudio, rows]);

  const selectReusableAudio = useCallback(async (row: AudioRow, assetId: string) => {
    const updatedRow = { ...row, selectedReusableAssetId: assetId };
    setRows((prev) =>
      prev.map((candidate) => candidate.id === row.id ? updatedRow : candidate),
    );
    if (getSelectedReusableOption(updatedRow)?.audioUrl) {
      await lookupReusableAudio([updatedRow], true);
    }
  }, [lookupReusableAudio, setRows]);

  return {
    lookupReusableAudio,
    useAllExisting,
    selectReusableAudio,
  };
}
