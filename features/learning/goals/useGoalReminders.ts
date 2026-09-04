'use client';

import { useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import { isoWeekday, isoWeekStart } from '@/packages/domain/goals/week';
import { rescheduleReminders } from '@/lib/notifications/runtime';
import { syncGrantedStudyWebPush } from './web-push';

function goalForDay(summary: GoalSummary, dayKey: string) {
  const pending = summary.goal.pending;
  return pending && pending.effectiveFromDay <= dayKey ? pending : summary.goal.active;
}

export function useGoalReminders(summary: GoalSummary | null) {
  // The native build schedules these locally, so unlike the browser-push copy
  // it can be read straight from the interface dictionary. Both paths use the
  // same two keys; the server-side copy is kept in step by
  // `supabase/functions/send-study-reminders/messages.ts`.
  const { t } = useI18n();
  const title = t('goal.reminderPushTitle');
  const body = t('goal.reminderPushBody');

  useEffect(() => {
    if (!summary) return;
    if (summary.reminder.onboardingAnswered && summary.reminder.enabled && summary.goal.active?.enabled) {
      void syncGrantedStudyWebPush();
    }
    const reschedule = () => {
      const rows = summary.days;
      void rescheduleReminders({
        today: summary.today,
        localMinutes: summary.reminder.localMinutes,
        title,
        body,
        day: (dayKey) => {
          const goal = goalForDay(summary, dayKey);
          if (!goal || !summary.reminder.onboardingAnswered || !summary.reminder.enabled) return null;
          if (goal.weekdays && !goal.weekdays.includes(isoWeekday(dayKey))) return null;
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
  }, [body, summary, title]);
}
