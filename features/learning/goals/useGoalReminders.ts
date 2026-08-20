'use client';

import { useEffect } from 'react';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import { isoWeekStart } from '@/packages/domain/goals/week';
import { rescheduleReminders } from '@/lib/notifications/runtime';
import { syncGrantedStudyWebPush } from './web-push';

function goalForDay(summary: GoalSummary, dayKey: string) {
  const pending = summary.goal.pending;
  return pending && pending.effectiveFromDay <= dayKey ? pending : summary.goal.active;
}

export function useGoalReminders(summary: GoalSummary | null) {
  useEffect(() => {
    if (!summary) return;
    if (summary.reminder.enabled && summary.goal.active?.enabled) {
      void syncGrantedStudyWebPush();
    }
    const reschedule = () => {
      const rows = summary.days;
      void rescheduleReminders({
        today: summary.today,
        localMinutes: summary.reminder.localMinutes,
        title: 'Get Word',
        body: 'A short study session is ready.',
        day: (dayKey) => {
          const goal = goalForDay(summary, dayKey);
          if (!goal || !summary.reminder.enabled) return null;
          const week = isoWeekStart(dayKey);
          const metDaysThisWeek = rows.filter((row) => isoWeekStart(row.dayKey) === week && row.met).length;
          return {
            enabled: goal.enabled,
            requiredDays: goal.daysPerWeek,
            metDaysThisWeek,
            todayMet: rows.find((row) => row.dayKey === dayKey)?.met ?? false,
          };
        },
      });
    };
    reschedule();
    window.addEventListener('get-word:reschedule-reminders', reschedule);
    return () => window.removeEventListener('get-word:reschedule-reminders', reschedule);
  }, [summary]);
}
