'use client';

import { useCallback, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';
import {
  buildAudioRows,
  getPreviewSource,
  getSelectedReusableOption,
  type AudioRow,
  type AudioSide,
} from '@/features/lists/audio-step/rows';
import {
  formatLanguage,
} from '@/features/lists/audio-step/language';
import { useAudioPlayback } from '@/features/lists/audio-step/useAudioPlayback';
import { useGoogleTtsVoiceSelection } from '@/features/lists/audio-step/useGoogleTtsVoiceSelection';
import { formatVoiceLabel } from '@/features/lists/audio-step/voiceMix';
import { useReusableAudioLookup } from '@/features/lists/audio-step/useReusableAudioLookup';
import { useAudioGenerationWorkflow } from '@/features/lists/audio-step/useAudioGenerationWorkflow';
import { AudioStepRow } from '@/features/lists/audio-step/AudioStepRow';
import { GoogleUsageHint } from './GoogleUsageHint';

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

function buildAudioStepResetKey(list: WordList, items: WordListItem[], audioSide: AudioSide) {
  return [
    list.id,
    list.languageFrom,
    list.languageTo,
    audioSide,
    items.map((item) => [
      item.id,
      item.textKnown,
      item.textTarget ?? '',
      item.knownAudioAssetId ?? '',
      item.knownAudioStatus ?? '',
      item.knownAudioUrl ?? '',
      item.audioAssetId ?? '',
      item.audioStatus,
      item.audioUrl ?? '',
    ].join(':')).join('|'),
  ].join('::');
}

export function AudioStep({
  list,
  items,
  audioSide,
  ...props
}: AudioStepProps) {
  const resetKey = useMemo(
    () => buildAudioStepResetKey(list, items, audioSide),
    [audioSide, items, list],
  );

  return (
    <AudioStepContent
      key={resetKey}
      list={list}
      items={items}
      audioSide={audioSide}
      {...props}
    />
  );
}

function AudioStepContent({
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
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    voiceOptions,
    voiceGenders,
    selection,
    selectionKey,
    loadingVoices,
    setSingleVoice,
    enableMix,
    toggleMixVoice,
    selectAllMixVoices,
    clearMixVoices,
    resolveVoice,
  } = useGoogleTtsVoiceSelection(activeLanguageCode);
  const MIX_OPTION_VALUE = '__mix__';
  const selectValue = selection.mode === 'mix' ? MIX_OPTION_VALUE : selection.voiceId;
  const mixVoiceIds = selection.mode === 'mix' ? selection.voiceIds : [];

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
  const googleTtsUsage = googleUsage?.account.find((scope) => scope.scope === 'tts');
  const isGoogleTtsPaused = Boolean(googleTtsUsage?.paused);
  const googlePausedMessage = googleTtsUsage?.limit_message
    ?? t('lists.googleLimitReached');

  const {
    useAllExisting: handleUseAllExisting,
    selectReusableAudio: handleReusableSelectionChange,
  } = useReusableAudioLookup({
    rows,
    setRows,
    setError,
    audioSide,
    resolveVoice,
    selectionKey,
    t,
  });

  const {
    generating,
    regeneratingIds,
    progress,
    generateAll: handleGenerateAll,
    regenerateRow: handleRegenerateRow,
  } = useAudioGenerationWorkflow({
    rows,
    setRows,
    setError,
    setPlaybackErrors,
    clearCachedAudio,
    preloadAudio,
    pause: handlePause,
    audioSide,
    resolveVoice,
    isGoogleTtsPaused,
    googlePausedMessage,
    onUsageRefresh,
    t,
  });

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
              value={selectValue}
              onChange={(event) => {
                if (event.target.value === MIX_OPTION_VALUE) {
                  enableMix();
                } else {
                  setSingleVoice(event.target.value);
                }
              }}
              disabled={generating || regeneratingIds.size > 0 || loadingVoices}
              className="rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-text disabled:opacity-50"
            >
              <option value="default">
                {loadingVoices ? t('lists.loadingVoices') : t('lists.defaultGoogleVoice')}
              </option>
              {voiceOptions.length > 1 && (
                <option value={MIX_OPTION_VALUE}>{t('lists.mixVoices')}</option>
              )}
              {voiceOptions.map((voice) => (
                <option key={voice} value={voice}>
                  {formatVoiceLabel(voice, voiceGenders)}
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
        {selection.mode === 'mix' && (
          <div className="mt-3 border-t border-border-subtle pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-text-soft">{t('lists.mixVoicesHint')}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={generating || regeneratingIds.size > 0 || mixVoiceIds.length === voiceOptions.length}
                  onClick={selectAllMixVoices}
                  className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-text-soft transition-colors hover:text-text disabled:opacity-40"
                >
                  {t('lists.selectAllVoices')}
                </button>
                <button
                  type="button"
                  disabled={generating || regeneratingIds.size > 0 || mixVoiceIds.length === 0}
                  onClick={clearMixVoices}
                  className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-text-soft transition-colors hover:text-text disabled:opacity-40"
                >
                  {t('lists.unselectAllVoices')}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {voiceOptions.map((voice) => {
                const active = mixVoiceIds.includes(voice);
                return (
                  <button
                    key={voice}
                    type="button"
                    disabled={generating || regeneratingIds.size > 0}
                    aria-pressed={active}
                    onClick={() => toggleMixVoice(voice)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-accent bg-accent/15 text-text'
                        : 'border-border-subtle text-text-soft hover:text-text'
                    }`}
                  >
                    {formatVoiceLabel(voice, voiceGenders)}
                  </button>
                );
              })}
            </div>
            {mixVoiceIds.length === 0 && (
              <p className="mt-1.5 text-[11px] text-text-soft/80">{t('lists.mixVoicesNone')}</p>
            )}
          </div>
        )}
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
          {rows.map((row) => (
            <AudioStepRow
              key={row.id}
              row={row}
              isPlaying={playingId === row.id}
              isRegenerating={regeneratingIds.has(row.id)}
              playbackError={playbackErrors[row.id]}
              generating={generating}
              isGoogleTtsPaused={isGoogleTtsPaused}
              onPlay={(selectedRow) => void handlePlaySingle(selectedRow)}
              onRegenerate={(selectedRow) => void handleRegenerateRow(selectedRow)}
              onReusableSelectionChange={(selectedRow, assetId) =>
                void handleReusableSelectionChange(selectedRow, assetId)
              }
            />
          ))}
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
