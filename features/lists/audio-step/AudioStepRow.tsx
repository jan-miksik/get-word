'use client';

import { useI18n } from '@/components/I18nProvider';
import {
  getPreviewSource,
  getSelectedReusableOption,
  type AudioRow,
} from './rows';

type AudioStepRowProps = {
  row: AudioRow;
  isPlaying: boolean;
  isRegenerating: boolean;
  playbackError?: string;
  generating: boolean;
  isGoogleTtsPaused: boolean;
  voiceNote?: string;
  onPlay: (row: AudioRow) => void;
  onRegenerate: (row: AudioRow) => void;
  onReusableSelectionChange: (row: AudioRow, assetId: string) => void;
};

export function AudioStepRow({
  row,
  isPlaying,
  isRegenerating,
  playbackError,
  generating,
  isGoogleTtsPaused,
  voiceNote,
  onPlay,
  onRegenerate,
  onReusableSelectionChange,
}: AudioStepRowProps) {
  const { t } = useI18n();
  const canPlay = Boolean(getPreviewSource(row));
  const selectedReusable = getSelectedReusableOption(row);

  return (
    <div
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
          onClick={() => onPlay(row)}
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
          {voiceNote ? (
            <span className="mt-1 block break-words text-[11px] text-text-soft/80">
              {voiceNote}
            </span>
          ) : null}
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
            onChange={(event) => onReusableSelectionChange(row, event.target.value)}
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
          onClick={() => onRegenerate(row)}
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
}
