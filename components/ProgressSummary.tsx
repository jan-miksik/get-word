'use client';

import type { ProgressStats } from '@/lib/progress-stats';

interface ProgressSummaryProps {
  progressStats: ProgressStats;
}

export function ProgressSummary({ progressStats }: ProgressSummaryProps) {
  if (progressStats.total === 0) return null;
  if (progressStats.readyCount === 0) return null;

  return (
    <div className="progress-summary">
      <span className="inline-flex items-center gap-1 text-accent">
        <span className="text-[0.6875rem] font-semibold opacity-90">({progressStats.readyCount})</span>
        <span className="text-[0.6875rem] font-medium lowercase">to repeat</span>
      </span>
    </div>
  );
}
