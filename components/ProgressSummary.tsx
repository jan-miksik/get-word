'use client';

import type { ProgressStats } from '@/lib/progress-stats';

interface ProgressSummaryProps {
  progressStats: ProgressStats;
}

export function ProgressSummary({ progressStats }: ProgressSummaryProps) {
  if (progressStats.total === 0) return null;

  return (
    <div className="progress-summary">
      <span className="inline-flex items-center gap-1 text-[#fbbf24]">
        <span className="text-[0.6875rem] font-medium lowercase">fresh</span>
        <span className="text-[0.6875rem] font-semibold opacity-90">({progressStats.fresh})</span>
      </span>
      <span className="inline-flex items-center gap-1 text-accent">
        <span className="text-[0.6875rem] font-medium lowercase">learning</span>
        <span className="text-[0.6875rem] font-semibold opacity-90">({progressStats.learning})</span>
      </span>
      <span className="inline-flex items-center gap-1 text-[#22c55e]">
        <span className="text-[0.6875rem] font-medium lowercase">done</span>
        <span className="text-[0.6875rem] font-semibold opacity-90">({progressStats.done})</span>
      </span>
    </div>
  );
}
