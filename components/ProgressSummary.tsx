'use client';

import type { ProgressStats } from '@/lib/progress-stats';

interface ProgressSummaryProps {
  progressStats: ProgressStats;
}

export function ProgressSummary({ progressStats }: ProgressSummaryProps) {
  if (progressStats.total === 0) return null;

  return (
    <div className="progress-summary">
      <span className="progress-summary-item fresh">
        <span className="progress-summary-label">fresh</span>
        <span className="progress-summary-value">({progressStats.fresh})</span>
      </span>
      <span className="progress-summary-item learning">
        <span className="progress-summary-label">learning</span>
        <span className="progress-summary-value">({progressStats.learning})</span>
      </span>
      <span className="progress-summary-item done">
        <span className="progress-summary-label">done</span>
        <span className="progress-summary-value">({progressStats.done})</span>
      </span>
    </div>
  );
}
