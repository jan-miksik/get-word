'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import {
  readStoredGoogleVoiceId,
  writeStoredGoogleVoiceId,
} from '@/features/lists/client/storage';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';
import {
  buildAudioRows,
  getPreviewSource,
  getSelectedReusableOption,
  toAudioVariant,
  type AudioRow,
  type AudioSide,
} from '@/features/lists/audio-step/rows';
import {
  chunkArray,
  getErrorFromPayload,
  readDebugResponse,
  type AudioGenerationResult,
  type AudioReuseResult,
} from '@/features/lists/audio-step/api';
import {
  formatLanguage,
  getBaseLanguage,
  type TtsLanguageOption,
} from '@/features/lists/audio-step/language';
import { useAudioPlayback } from '@/features/lists/audio-step/useAudioPlayback';
import { GoogleUsageHint } from './GoogleUsageHint';

const AUDIO_LOG_PREFIX = '[Get Word audio]';
const AUDIO_REUSE_BATCH_SIZE = 200;

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
  const { t } = useI18n();
  const activeLanguageCode = audioSide === 'known' ? list.languageFrom : list.languageTo;
  const activeLanguageLabel = audioSide === 'known'
    ? formatLanguage(list.languageFrom, t)
    : formatLanguage(list.languageTo, t);
  const [rows, setRows] = useState<AudioRow[]>(() => buildAudioRows(items, list, audioSide));
  const [generating, setGenerating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState(0);
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const [selectedGoogleVoiceId, setSelectedGoogleVoiceId] = useState(
    () => readStoredGoogleVoiceId(activeLanguageCode),
  );
  const [loadingVoices, setLoadingVoices] = useState(false);
  const didInitializeVoiceRef = useRef(false);

  const markRowFailed = useCallback((rowId: string) => {
    setRows((prev) =>
      prev.map((candidate) =>
        candidate.id === rowId ? { ...candidate, audioStatus: 'failed' as const } : candidate,
      ),
    );
  }, []);

  const {
    playingId,
    playbackErrors,
    setPlaybackErrors,
    clearCachedAudio,
    preloadAudio,
    playSingle,
    playQueue,
    pause: handlePause,
    resetForReload: resetPlaybackForReload,
  } = useAudioPlayback({ rows, t, onLinkedSourceFailed: markRowFailed });

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
    ?? t('lists.googleLimitReached');

  useEffect(() => {
    setRows(buildAudioRows(items, list, audioSide));
    setError(null);
    setSelectedGoogleVoiceId(readStoredGoogleVoiceId(activeLanguageCode));
    didInitializeVoiceRef.current = false;
    resetPlaybackForReload();
  }, [activeLanguageCode, audioSide, items, list, resetPlaybackForReload]);

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
      } catch {
        if (cancelled) return;
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
            items: batchRows.map((row) => ({
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
  }, [audioSide, googleVoiceIdForRequest, t]);

  useEffect(() => {
    const uncheckedRows = rows.filter((row) => row.audioText && row.reuseStatus === 'unchecked');
    if (uncheckedRows.length === 0) return;
    void lookupReusableAudio(uncheckedRows, false);
  }, [lookupReusableAudio, rows]);

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
        setError(t('lists.audioGenerateFailed', {
          message: attempted[0]?.error ?? t('lists.audioGenerateGenericFailed'),
        }));
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
  }, [audioSide, clearCachedAudio, googleVoiceIdForRequest, onUsageRefresh, preloadAudio, t]);

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
    handlePause();
    await generateRows([row], true);
  }, [generateRows, googlePausedMessage, handlePause, isGoogleTtsPaused]);

  const handlePlaySingle = useCallback(async (row: AudioRow) => {
    const source = getPreviewSource(row);
    if (!source) return;
    await playSingle(row, source);
  }, [playSingle]);

  const handlePlayAll = useCallback(() => {
    const queue = rows.flatMap((row) => {
      const source = getPreviewSource(row);
      return source ? [{ rowId: row.id, source }] : [];
    });
    playQueue(queue);
  }, [playQueue, rows]);

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

  const subtitle = useMemo(() => {
    const parts = [t('lists.audioReadySummary', { ready: readyCount, total: rows.length })];
    if (dedupCount > 0) parts.push(t('lists.reusedCount', { count: dedupCount }));
    if (reusableCount > 0) parts.push(t('lists.savedVersionsCount', { count: reusableCount }));
    return parts.join(' • ');
  }, [dedupCount, readyCount, reusableCount, rows.length, t]);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="mt-0.5 text-sm text-text-soft">
            {t('lists.audioForLanguage', { summary: subtitle, language: activeLanguageLabel })}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft transition-colors hover:text-text"
          onClick={onSkip}
        >
          {t('lists.skip')}
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-border-subtle bg-background-elevated p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[14rem] flex-col gap-1 text-xs text-text-soft">
            {t('lists.googleVoice')}
            <select
              value={selectedGoogleVoiceId}
              onChange={(event) => handleGoogleVoiceChange(event.target.value)}
              disabled={generating || regeneratingIds.size > 0 || loadingVoices}
              className="rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-text disabled:opacity-50"
            >
              <option value="default">
                {loadingVoices ? t('lists.loadingVoices') : t('lists.defaultGoogleVoice')}
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
              {t('lists.useSelectedExisting', { count: selectedReusableCount })}
            </button>
          )}

          <button
            type="button"
            disabled={generating || needsGenCount === 0 || isGoogleTtsPaused}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
            onClick={handleGenerateAll}
          >
            {generating ? t('lists.generating') : t('lists.generateAudio', { count: needsGenCount })}
          </button>

          {rows.some((row) => Boolean(getPreviewSource(row))) && (
            <button
              type="button"
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text transition-colors hover:bg-background/50"
              onClick={playingId ? handlePause : handlePlayAll}
            >
              {playingId ? t('lists.pause') : t('lists.playAll')}
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
                    title={t('lists.playAudio')}
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
                          {t('lists.versionCount', { index: index + 1, total: row.reusableOptions.length })}
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
                    {isRegenerating
                      ? t('lists.generating')
                      : row.audioStatus === 'ready'
                      ? t('lists.generateNew')
                      : t('lists.generate')}
                  </button>

                  <span className="shrink-0 text-xs">
                    {row.audioStatus === 'ready' && (
                      <span className="text-done">
                        {row.source === 'dedup' ? t('lists.audioStatusReused') : t('lists.audioStatusReady')}
                      </span>
                    )}
                    {row.audioStatus === 'pending' && (
                      <span className="text-fresh">{t('lists.audioStatusPending')}</span>
                    )}
                    {row.audioStatus === 'failed' && (
                      <span className="text-danger">{t('lists.audioStatusFailed')}</span>
                    )}
                    {row.audioStatus === 'none' && (
                      <span className="text-text-soft">{t('lists.audioStatusNone')}</span>
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
            {`\u2190 ${t('lists.back')}`}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text transition-colors hover:bg-background-elevated"
            onClick={onSkip}
          >
            {t('lists.skip')}
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
            {audioSide === 'known' ? t('lists.confirmAudio') : t('lists.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
