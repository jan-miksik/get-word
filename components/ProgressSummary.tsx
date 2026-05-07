'use client';

import type { ProgressStats } from '@/lib/progress-stats';

interface ProgressSummaryProps {
  progressStats: ProgressStats;
}

export function ProgressSummary({ progressStats }: ProgressSummaryProps) {
  if (progressStats.total === 0) return null;
  if (progressStats.readyCount === 0) return null;

  return (
    <div className="progress-summary" aria-label={`${progressStats.readyCount} ready to repeat`}>
      <span className="stat-chip stat-chip--repeat">
        <span className="stat-chip-icon stat-chip-icon--repeat" aria-hidden="true">
          <span className="stat-chip-pulse" />
        </span>
        <span className="stat-chip-copy">
          <span className="stat-chip-value">{progressStats.readyCount}</span>
          <span className="stat-chip-label">to repeat</span>
        </span>
      </span>
    </div>
  );
}
