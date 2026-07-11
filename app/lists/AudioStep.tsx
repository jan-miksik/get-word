'use client';

import { useCallback, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';
import {
  buildAudioRows,
  compareAudioRows,
  getPreviewSource,
  getSelectedReusableOption,
  type AudioRow,
  type AudioSide,
  type AudioSortMode,
} from '@/features/lists/audio-step/rows';
import {
  formatLanguage,
} from '@/features/lists/audio-step/language';
import { useAudioPlayback } from '@/features/lists/audio-step/useAudioPlayback';
import { useGoogleTtsVoiceSelection } from '@/features/lists/audio-step/useGoogleTtsVoiceSelection';
import { formatVoiceLabel, getChirp3HdVoiceOptions } from '@/features/lists/audio-step/voiceMix';
import { useReusableAudioLookup } from '@/features/lists/audio-step/useReusableAudioLookup';
import { useAudioGenerationWorkflow } from '@/features/lists/audio-step/useAudioGenerationWorkflow';
import { AudioStepRow } from '@/features/lists/audio-step/AudioStepRow';
import { listsApiFetch } from '@/features/lists/api';
import { DEFAULT_GOOGLE_TTS_VOICE_ID } from '@/lib/audio-constants';
import { GoogleUsageHint } from './GoogleUsageHint';

type ScanFlaggedItem = { itemId: string; side: string; text: string; reason: string };

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

const MIX_CHIRP3_HD_OPTION_VALUE = '__mix_chirp3_hd__';
const MIX_ALL_OPTION_VALUE = '__mix_all__';
const MIX_CUSTOM_OPTION_VALUE = '__mix_custom__';

function sameVoiceSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((voice, index) => voice === sortedRight[index]);
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
      item.knownAudioCreatedAt ?? '',
      item.audioAssetId ?? '',
      item.audioStatus,
      item.audioUrl ?? '',
      item.audioCreatedAt ?? '',
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
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);
  const [showVoiceNotes, setShowVoiceNotes] = useState(false);
  const [applyingExistingAudio, setApplyingExistingAudio] = useState(false);
  const [applyingExistingCount, setApplyingExistingCount] = useState(0);
  // Soft "please check the audio" notes from the quality autofix — distinct from
  // playbackErrors (which mean "cannot play").
  const [audioWarnings, setAudioWarnings] = useState<Record<string, string>>({});
  // ⋯ menu → scan/repair broken clips on the current side.
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanFlagged, setScanFlagged] = useState<ScanFlaggedItem[] | null>(null);
  const [scanSelected, setScanSelected] = useState<Set<string>>(() => new Set());
  const [sortMode, setSortMode] = useState<AudioSortMode>('default');
  const {
    voiceOptions,
    voiceGenders,
    selection,
    selectionKey,
    loadingVoices,
    setSingleVoice,
    enableChirp3HdMix,
    enableMix,
    toggleMixVoice,
    selectAllMixVoices,
    clearMixVoices,
    resolveVoice,
  } = useGoogleTtsVoiceSelection(activeLanguageCode);
  const chirp3HdVoiceIds = useMemo(() => getChirp3HdVoiceOptions(voiceOptions), [voiceOptions]);
  const mixVoiceIds = selection.mode === 'mix' ? selection.voiceIds : [];
  const isChirp3HdMix = selection.mode === 'mix' && sameVoiceSet(mixVoiceIds, chirp3HdVoiceIds);
  const isAllVoiceMix = selection.mode === 'mix' && sameVoiceSet(mixVoiceIds, voiceOptions);
  const selectValue = selection.mode === 'mix'
    ? isChirp3HdMix
      ? MIX_CHIRP3_HD_OPTION_VALUE
      : isAllVoiceMix
        ? MIX_ALL_OPTION_VALUE
        : MIX_CUSTOM_OPTION_VALUE
    : selection.voiceId;

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
    storeGeneratedAudio,
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
    etaSeconds,
    generateAll: handleGenerateAll,
    regenerateRow: handleRegenerateRow,
    regenerateRows: handleRegenerateRows,
  } = useAudioGenerationWorkflow({
    rows,
    setRows,
    setError,
    setPlaybackErrors,
    setAudioWarnings,
    clearCachedAudio,
    preloadAudio,
    storeGeneratedAudio,
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

  const repairIds = useMemo(
    () => new Set((scanFlagged ?? []).map((flag) => flag.itemId)),
    [scanFlagged],
  );

  const sortedRows = useMemo(() => {
    if (sortMode === 'default') return rows;
    const originalOrder = new Map(rows.map((row, index) => [row.id, index]));
    return [...rows].sort((left, right) => {
      const result = compareAudioRows(left, right, sortMode, {
        repairIds,
        playbackErrors,
        qualityWarnings: audioWarnings,
      });
      return result || ((originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0));
    });
  }, [audioWarnings, playbackErrors, repairIds, rows, sortMode]);

  const handlePlayAll = useCallback(() => {
    const queue = sortedRows.flatMap((row) => {
      const source = getPreviewSource(row);
      return source ? [{ rowId: row.id, source }] : [];
    });
    playQueue(queue);
  }, [playQueue, sortedRows]);

  const handleUseSelectedExisting = useCallback(async () => {
    setApplyingExistingCount(selectedReusableCount);
    setApplyingExistingAudio(true);
    try {
      await handleUseAllExisting();
    } finally {
      setApplyingExistingAudio(false);
      setApplyingExistingCount(0);
    }
  }, [handleUseAllExisting, selectedReusableCount]);

  const handleScanForProblems = useCallback(async () => {
    setMenuOpen(false);
    setScanning(true);
    setScanError(null);
    setScanFlagged(null);
    try {
      const res = await listsApiFetch(`/api/lists/${list.id}/audio/scan`, {
        method: 'POST',
        body: JSON.stringify({ side: audioSide }),
      });
      if (!res.ok) {
        throw new Error(t('lists.audioScanFailed'));
      }
      const data = (await res.json()) as { flagged?: ScanFlaggedItem[] };
      const flagged = (data.flagged ?? []).filter((f) => f.side === audioSide);
      setScanFlagged(flagged);
      setScanSelected(new Set(flagged.map((f) => f.itemId))); // default-selected
    } catch (err) {
      setScanError(err instanceof Error ? err.message : t('lists.audioScanFailed'));
    } finally {
      setScanning(false);
    }
  }, [audioSide, list.id, t]);

  const handleAutoRepair = useCallback(async () => {
    if (!scanFlagged) return;
    const selectedIds = new Set(
      scanFlagged.filter((f) => scanSelected.has(f.itemId)).map((f) => f.itemId),
    );
    const targetRows = rows.filter((row) => selectedIds.has(row.id));
    setScanFlagged(null);
    await handleRegenerateRows(targetRows);
  }, [handleRegenerateRows, rows, scanFlagged, scanSelected]);

  const toggleScanSelected = useCallback((itemId: string) => {
    setScanSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  }, [onComplete]);

  const formatGenerationVoice = useCallback((voiceId: string | null | undefined) => {
    if (!voiceId || voiceId === 'default' || voiceId === DEFAULT_GOOGLE_TTS_VOICE_ID) {
      return t('lists.defaultGoogleVoice');
    }
    return formatVoiceLabel(voiceId, voiceGenders);
  }, [t, voiceGenders]);

  const getVoiceNote = useCallback((row: AudioRow): string | undefined => {
    if (row.audioStatus === 'ready') {
      if (row.generationVoiceId) {
        return t('lists.audioGeneratedWithVoice', {
          voice: formatGenerationVoice(row.generationVoiceId),
        });
      }
      // Voice not stored for this asset — omit the note rather than show a placeholder.
      return undefined;
    }

    return t('lists.audioWillUseVoice', {
      voice: formatGenerationVoice(resolveVoice(row.audioText) ?? 'default'),
    });
  }, [formatGenerationVoice, resolveVoice, t]);

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
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label={t('lists.audioMoreActions')}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft transition-colors hover:text-text"
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-border-subtle bg-background-elevated py-1 shadow-lg">
                <button
                  type="button"
                  disabled={scanning}
                  className="block w-full px-3 py-2 text-left text-sm text-text transition-colors hover:bg-accent/10 disabled:opacity-60"
                  onClick={() => void handleScanForProblems()}
                >
                  {scanning ? t('lists.audioScanning') : t('lists.audioScanForProblems')}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft transition-colors hover:text-text"
            onClick={onSkip}
          >
            {t('lists.skip')}
          </button>
        </div>
      </div>

      {scanError && (
        <div className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{scanError}</div>
      )}

      {scanFlagged && (
        <div className="mb-4 rounded-lg border border-border-subtle bg-background-elevated p-3">
          {scanFlagged.length === 0 ? (
            <p className="text-sm text-text-soft">{t('lists.audioScanClean')}</p>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-text">
                {t('lists.audioScanFound', { count: scanFlagged.length })}
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {scanFlagged.map((flag) => {
                  const flaggedRow = rows.find((row) => row.id === flag.itemId);
                  const canPlayFlagged = Boolean(flaggedRow && getPreviewSource(flaggedRow));
                  return (
                    <div key={flag.itemId} className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        aria-label={flag.text}
                        checked={scanSelected.has(flag.itemId)}
                        onChange={() => toggleScanSelected(flag.itemId)}
                      />
                      <button
                        type="button"
                        disabled={!canPlayFlagged}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                          canPlayFlagged
                            ? playingId === flag.itemId
                              ? 'bg-accent text-background'
                              : 'bg-accent/10 text-accent hover:bg-accent/20'
                            : 'bg-border-subtle text-text-soft'
                        }`}
                        title={t('lists.playAudio')}
                        onClick={() => {
                          if (flaggedRow) void handlePlaySingle(flaggedRow);
                        }}
                      >
                        {playingId === flag.itemId ? (
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
                      <span className="min-w-0 flex-1 truncate">{flag.text}</span>
                      <span className="shrink-0 text-xs text-text-soft">{flag.reason}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={scanSelected.size === 0 || generating}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
                  onClick={() => void handleAutoRepair()}
                >
                  {t('lists.audioAutoRepair', { count: scanSelected.size })}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft transition-colors hover:text-text"
                  onClick={() => setScanFlagged(null)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mb-4 rounded-lg border border-border-subtle bg-background-elevated p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[14rem] flex-col gap-1 text-xs text-text-soft">
            {t('lists.googleVoice')}
            <select
              value={selectValue}
              onChange={(event) => {
                if (event.target.value === MIX_CHIRP3_HD_OPTION_VALUE) {
                  enableChirp3HdMix();
                } else if (event.target.value === MIX_ALL_OPTION_VALUE) {
                  enableMix();
                } else {
                  setSingleVoice(event.target.value);
                }
              }}
              disabled={generating || applyingExistingAudio || regeneratingIds.size > 0 || loadingVoices}
              className="rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-text disabled:opacity-50"
            >
              {chirp3HdVoiceIds.length > 1 && (
                <option value={MIX_CHIRP3_HD_OPTION_VALUE}>{t('lists.mixChirp3HdVoices')}</option>
              )}
              {voiceOptions.length > 1 && (
                <option value={MIX_ALL_OPTION_VALUE}>{t('lists.mixVoices')}</option>
              )}
              {selection.mode === 'mix' && !isChirp3HdMix && !isAllVoiceMix && (
                <option value={MIX_CUSTOM_OPTION_VALUE}>{t('lists.customVoiceMix')}</option>
              )}
              <option value="default">
                {loadingVoices ? t('lists.loadingVoices') : t('lists.defaultGoogleVoice')}
              </option>
              {voiceOptions.map((voice) => (
                <option key={voice} value={voice}>
                  {formatVoiceLabel(voice, voiceGenders)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-text-soft">
            {t('lists.audioSortLabel')}
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as AudioSortMode)}
              className="rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-text"
            >
              <option value="default">{t('lists.audioSortDefault')}</option>
              <option value="repair">{t('lists.audioSortRepair')}</option>
              <option value="missing">{t('lists.audioSortMissing')}</option>
              <option value="latest">{t('lists.audioSortLatest')}</option>
            </select>
          </label>

          {selectedReusableCount > 0 && (
            <button
              type="button"
              disabled={generating || applyingExistingAudio || regeneratingIds.size > 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-done px-4 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              onClick={() => void handleUseSelectedExisting()}
            >
              {applyingExistingAudio && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {applyingExistingAudio
                ? t('lists.applyingExistingAudio')
                : t('lists.useSelectedExisting', { count: selectedReusableCount })}
            </button>
          )}

          <button
            type="button"
            disabled={generating || applyingExistingAudio || needsGenCount === 0 || isGoogleTtsPaused}
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

          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-soft">
            <input
              type="checkbox"
              checked={showVoiceNotes}
              onChange={(event) => setShowVoiceNotes(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            {t('lists.showVoiceInfo')}
          </label>
        </div>
        {selection.mode === 'mix' && (
          <div className="mt-3 border-t border-border-subtle pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-text-soft">{t('lists.mixVoicesHint')}</p>
              <div className="flex gap-1.5">
                {showVoiceOptions && (
                  <>
                    <button
                      type="button"
                      disabled={generating || applyingExistingAudio || regeneratingIds.size > 0 || mixVoiceIds.length === voiceOptions.length}
                      onClick={selectAllMixVoices}
                      className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-text-soft transition-colors hover:text-text disabled:opacity-40"
                    >
                      {t('lists.selectAllVoices')}
                    </button>
                    <button
                      type="button"
                      disabled={generating || applyingExistingAudio || regeneratingIds.size > 0 || mixVoiceIds.length === 0}
                      onClick={clearMixVoices}
                      className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-text-soft transition-colors hover:text-text disabled:opacity-40"
                    >
                      {t('lists.unselectAllVoices')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowVoiceOptions((current) => !current)}
                  className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-text-soft transition-colors hover:text-text"
                >
                  {showVoiceOptions ? t('lists.hideVoiceOptions') : t('lists.showVoiceOptions')}
                </button>
              </div>
            </div>
            {showVoiceOptions && (
              <div className="flex flex-wrap gap-1.5">
                {voiceOptions.map((voice) => {
                  const active = mixVoiceIds.includes(voice);
                  return (
                    <button
                      key={voice}
                      type="button"
                      disabled={generating || applyingExistingAudio || regeneratingIds.size > 0}
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
            )}
            {showVoiceOptions && mixVoiceIds.length === 0 && (
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

      {applyingExistingAudio && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg border border-done/30 bg-done/10 p-3 text-xs text-done"
        >
          {t('lists.applyingExistingAudioDetail', { count: applyingExistingCount })}
        </div>
      )}

      {generating && (
        <div className="mb-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {etaSeconds !== null && etaSeconds >= 45 && (
            <p className="mt-1.5 text-[11px] text-text-soft">
              {t('lists.generatingEtaMinutes', { count: Math.ceil(etaSeconds / 60) })}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <div className="max-h-[60vh] divide-y divide-border-subtle overflow-y-auto">
          {sortedRows.map((row) => (
            <AudioStepRow
              key={row.id}
              row={row}
              isPlaying={playingId === row.id}
              isRegenerating={regeneratingIds.has(row.id)}
              playbackError={playbackErrors[row.id]}
              qualityWarning={audioWarnings[row.id]}
              generating={generating || applyingExistingAudio}
              isGoogleTtsPaused={isGoogleTtsPaused}
              voiceNote={showVoiceNotes ? getVoiceNote(row) : undefined}
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
