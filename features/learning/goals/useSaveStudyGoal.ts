'use client';

import { useCallback, useState } from 'react';
import { syncUserData } from '@/lib/sync';
import { currentIanaTimezone } from '@/lib/local-day';
import type { StudyPacing, GoalPreset } from '@/packages/domain/goals/goal';
import type { GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';

export interface SaveStudyGoalOptions {
  preset?: GoalPreset;
  /** Turning the goal off keeps the shape, so switching it back on restores it. */
  enabled?: boolean;
}

/**
 * The single write path for a study goal.
 *
 * Both the intro card and the settings section save through here so the two
 * cannot drift in what they put in the `study_goal` mutation — the payload is
 * mode-dependent (`goal_new_words_per_day` *or* `goal_minutes_per_day`, never
 * both), which is exactly the kind of detail a second copy gets wrong.
 */
export function useSaveStudyGoal({ revision, pacing, onSaved }: {
  revision: number | undefined;
  pacing: StudyPacing;
  onSaved: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);
  const save = useCallback(async (value: GoalPickerValue, options: SaveStudyGoalOptions = {}) => {
    if (revision === undefined || pending) return;
    const enabled = options.enabled ?? true;
    setPending(true);
    try {
      await syncUserData({
        study_goal: {
          enabled,
          mode: value.mode,
          goal_days_per_week: value.weekdays.length,
          goal_weekdays: value.weekdays,
          ...(value.mode === 'words'
            ? { goal_new_words_per_day: value.newWordsPerDay }
            : { goal_minutes_per_day: value.minutesPerDay }),
          goal_preset: options.preset ?? 'custom',
          reveal_mode: pacing.revealMode, minigame_frequency: pacing.minigameFrequency,
          learning_fine_tune: pacing.fineTune, timezone: currentIanaTimezone(),
        },
        study_goal_base_revision: revision,
      }, { emitEvent: false });
      window.dispatchEvent(new Event('get-word:reschedule-reminders'));
      await onSaved();
    } catch (error) {
      // A failed goal write is not worth tearing the settings panel down for;
      // the summary refresh below leaves the UI showing what the server has.
      console.error('[study-goal] failed to save goal:', error);
    } finally {
      setPending(false);
    }
  }, [onSaved, pacing, pending, revision]);
  return { save, pending };
}
