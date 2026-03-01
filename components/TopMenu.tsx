'use client';

import { MouseEvent, useEffect, useRef, useState } from 'react';

interface TopMenuProps {
  onShowAll: (e: MouseEvent) => void;
  onCategory: (e: MouseEvent) => void;
  onProgress: (e: MouseEvent) => void;
  onMemoryHooks: (e: MouseEvent) => void;
  onSettings: (e: MouseEvent) => void;
  showAll: boolean;
  categoryCount: number;
  categoryActive: boolean;
  progressActive: boolean;
  readyCount?: number;
  showWaitingForRepeat?: boolean;
  onToggleWaitingForRepeat?: (e: MouseEvent) => void;
  currentTab?: 'all' | 'ready';
  score?: number;
}

function ScoreBadge({ score }: { score: number }) {
  const prevScore = useRef(score);
  const [delta, setDelta] = useState<{ value: number; key: number } | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    const diff = score - prevScore.current;
    prevScore.current = score;
    if (diff !== 0) {
      keyRef.current += 1;
      setDelta({ value: diff, key: keyRef.current });
      const t = setTimeout(() => setDelta(null), 900);
      return () => clearTimeout(t);
    }
  }, [score]);

  return (
    <span
      className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400/15 border border-yellow-400/30 text-yellow-600 dark:text-yellow-400 text-xs font-semibold tabular-nums"
      aria-label={`Game score: ${score}`}
    >
      ⭐ {score}
      {delta && (
        <span
          key={delta.key}
          className={`absolute -top-1 -right-1 text-xs font-bold pointer-events-none ${
            delta.value > 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
          style={{ animation: 'score-float 0.9s ease-out forwards' }}
        >
          {delta.value > 0 ? `+${delta.value}` : delta.value}
        </span>
      )}
      <style>{`
        @keyframes score-float {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 1; transform: translateY(-18px) scale(1.3); }
          100% { opacity: 0; transform: translateY(-28px) scale(0.8); }
        }
      `}</style>
    </span>
  );
}

export function TopMenu({
  onShowAll,
  onCategory,
  onProgress,
  onMemoryHooks,
  onSettings,
  showAll,
  categoryCount,
  categoryActive,
  progressActive,
  score,
}: TopMenuProps) {
  return (
    <div className="top-menu" aria-label="Top menu">
      <div className="flex flex-wrap items-center gap-2">
        <button className="mode-btn show-all-btn" onClick={onShowAll} type="button" aria-label={showAll ? "Hide completed items" : "Show all items"}>
          {showAll ? '🙉' : '🙈'}
        </button>
        {score !== undefined && <ScoreBadge score={score} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <button
          className={`mode-btn category-btn ${categoryActive ? 'is-active' : ''}`}
          onClick={onCategory}
          type="button"
          aria-label="Filter by category"
          data-count={categoryCount > 0 ? categoryCount : ''}
        >
          🏷️
        </button>
        <button
          className={`mode-btn progress-btn ${progressActive ? 'is-active' : ''}`}
          onClick={onProgress}
          type="button"
          aria-label="View progress"
        >
          📊
        </button>
        <button
          className="mode-btn memory-hooks-btn"
          onClick={onMemoryHooks}
          type="button"
          aria-label="Memory Hooks Info"
        >
          ℹ️
        </button>
        <button className="mode-btn settings-btn" onClick={onSettings} type="button">
          Settings
        </button>
      </div>
    </div>
  );
}

