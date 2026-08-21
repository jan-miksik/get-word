'use client';

import { useCallback, useState } from 'react';
import { syncUserData } from '@/lib/sync';
import { currentIanaTimezone } from '@/lib/local-day';
import { requestReminderPermission } from '@/lib/notifications/runtime';
import { subscribeToStudyWebPush } from './web-push';
import type { StudyPacing, GoalPreset } from '@/packages/domain/goals/goal';
import type { GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';

export function useSaveStudyGoal({ revision, pacing, onSaved }: {
  revision: number | undefined;
  pacing: StudyPacing;
  onSaved: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);
  const save = useCallback(async (value: GoalPickerValue, preset: GoalPreset = 'custom') => {
    if (revision === undefined || pending) return;
    setPending(true);
    try {
      await syncUserData({
        study_goal: {
          enabled: true, mode: value.mode, goal_days_per_week: value.daysPerWeek,
          ...(value.mode === 'words' ? { goal_new_words_per_day: value.newWordsPerDay } : { goal_minutes_per_day: value.minutesPerDay }),
          goal_preset: preset, reveal_mode: pacing.revealMode, minigame_frequency: pacing.minigameFrequency,
          learning_fine_tune: pacing.fineTune, timezone: currentIanaTimezone(),
        },
        study_goal_base_revision: revision,
      }, { emitEvent: false });
      void requestReminderPermission();
      void subscribeToStudyWebPush();
      window.dispatchEvent(new Event('get-word:reschedule-reminders'));
      await onSaved();
    } finally {
      setPending(false);
    }
  }, [onSaved, pacing, pending, revision]);
  return { save, pending };
}
