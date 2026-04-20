'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import type { WordList, WordListItem } from '@/features/lists/types';

type AudioRow = {
  id: string;
  textTarget: string;
  language: string;
  audioUrl: string | null;
  audioStatus: 'none' | 'pending' | 'ready' | 'failed';
  source?: 'dedup' | 'generated';
};

interface AudioStepProps {
  list: WordList;
  items: WordListItem[];
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
  onBack?: () => void;
}

export function AudioStep({ list, items, onComplete, onSkip, onBack }: AudioStepProps) {
  const [rows, setRows] = useState<AudioRow[]>(() =>
    items
      .filter((item) => item.textTarget)
      .map((item) => ({
        id: item.id,
        textTarget: item.textTarget!,
        language: list.languageTo,
        audioUrl: item.audioUrl ?? null,
        audioStatus: item.audioStatus as AudioRow['audioStatus'],
      }))
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playQueueRef = useRef<string[]>([]);

  const readyCount = rows.filter((r) => r.audioStatus === 'ready').length;
  const needsGenCount = rows.filter((r) => r.audioStatus === 'none' || r.audioStatus === 'failed').length;
  const dedupCount = rows.filter((r) => r.source === 'dedup').length;

  const handleGenerateAll = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setProgress(0);

    const toGenerate = rows.filter(
      (r) => r.audioStatus === 'none' || r.audioStatus === 'failed',
    );

    if (toGenerate.length === 0) {
      setGenerating(false);
      return;
    }

    try {
      const res = await listsApiFetch('/api/audio/generate/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: toGenerate.map((r) => ({
            id: r.id,
            text: r.textTarget,
            language: r.language,
          })),
          provider: 'google_tts',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Generation failed');
      }

      const data = await res.json();
      const resultMap = new Map<string, { audio_url: string | null; status: string; source?: string; error?: string }>();
      for (const r of data.results) {
        resultMap.set(r.id, r);
      }

      setRows((prev) =>
        prev.map((row) => {
          const result = resultMap.get(row.id);
          if (!result) return row;
          return {
            ...row,
            audioUrl: result.audio_url ?? row.audioUrl,
            audioStatus: result.status === 'ok' ? 'ready' : 'failed',
            source: result.source === 'dedup' || result.source === 'generated'
              ? result.source
              : undefined,
          };
        }),
      );

      // Surface a top-level error if every attempted item failed
      const attempted = data.results.filter((r: { id: string }) =>
        toGenerate.some((t) => t.id === r.id)
      );
      if (attempted.length > 0 && attempted.every((r: { status: string }) => r.status === 'error')) {
        const firstError = attempted[0]?.error ?? 'Generation failed';
        setError(`Audio generation failed: ${firstError}`);
      }

      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [rows]);

  const handlePlaySingle = useCallback((row: AudioRow) => {
    if (!row.audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(row.audioUrl);
    audioRef.current = audio;
    setPlayingId(row.id);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play();
  }, []);

  const handlePlayAll = useCallback(() => {
    const ready = rows.filter((r) => r.audioStatus === 'ready' && r.audioUrl);
    if (ready.length === 0) return;
    playQueueRef.current = ready.map((r) => r.id);
    playNext();
  }, [rows]);

  function playNext() {
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
    const audio = new Audio(row.audioUrl);
    audioRef.current = audio;
    setPlayingId(row.id);
    audio.onended = () => {
      setTimeout(() => playNext(), 1500);
    };
    audio.onerror = () => playNext();
    audio.play();
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
        <button
          type="button"
          disabled={generating || needsGenCount === 0}
          className="px-4 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handleGenerateAll}
        >
          {generating ? 'Generating...' : `Generate audio (${needsGenCount})`}
        </button>

        {readyCount > 0 && (
          <>
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
            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isPlaying ? 'bg-accent/10 border-l-2 border-l-accent' : ''
                }`}
              >
                {/* Play button */}
                <button
                  type="button"
                  disabled={row.audioStatus !== 'ready'}
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    row.audioStatus === 'ready'
                      ? isPlaying
                        ? 'bg-accent text-background'
                        : 'bg-accent/10 text-accent hover:bg-accent/20'
                      : 'bg-border-subtle text-text-soft'
                  }`}
                  onClick={() => handlePlaySingle(row)}
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
                <span className="flex-1 text-sm text-text truncate">{row.textTarget}</span>

                {/* Status indicator */}
                <span className="shrink-0 text-xs">
                  {row.audioStatus === 'ready' && (
                    <span className="text-done">ready</span>
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
