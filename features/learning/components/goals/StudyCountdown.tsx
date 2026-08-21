'use client';

import type { GoalSummary } from '@/packages/contracts/src/goals';
import { useStudyCountdown } from '@/features/learning/goals/useStudyCountdown';

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function StudyCountdown({
  day,
  enabled,
}: {
  day: GoalSummary['days'][number] | null;
  enabled: boolean;
}) {
  const { activeMs } = useStudyCountdown(day, enabled);
  if (!day || !enabled) return null;
  if (day.goalStatus === 'nothing_due') {
    return (
      <aside className="mx-auto mt-2 w-full max-w-[800px] rounded-xl bg-[#eef5ec] px-4 py-2 text-center text-sm font-semibold text-[#31543a]">
        Dnes není nic k procvičení. Odpočinek ti streak nepřeruší.
      </aside>
    );
  }
  if (day.goalMode === 'words') {
    return (
      <aside className="mx-auto mt-2 flex w-full max-w-[800px] items-center justify-between gap-3 rounded-xl bg-[#fff8e8] px-4 py-2 text-sm text-[#2a2218] shadow-sm">
        <span><strong>{day.introducedWords}/{day.resolvedNewTarget ?? 0}</strong> nová</span>
        <span><strong>{day.reviewedWords}/{day.resolvedReviewTarget ?? 0}</strong> opakování</span>
        <span className="text-[#735d43]">{formatDuration(activeMs)}</span>
      </aside>
    );
  }
  const budget = (day.resolvedMinutesBudget ?? day.goalMinutes ?? 0) * 60_000;
  const over = Math.max(0, activeMs - budget);
  return (
    <aside className="mx-auto mt-2 flex w-full max-w-[800px] items-center justify-between gap-3 rounded-xl bg-[#fff8e8] px-4 py-2 text-sm text-[#2a2218] shadow-sm">
      <span><strong>{formatDuration(activeMs)}</strong>{budget ? ` / ${formatDuration(budget)}` : ''}</span>
      <span>{day.answeredWords}/{day.goalWords ?? 0} položek</span>
      {over > 0 ? <span className="text-[#735d43]">+{formatDuration(over)}</span> : null}
    </aside>
  );
}
