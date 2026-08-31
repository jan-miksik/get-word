'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { ToggleSwitch } from '@/components/settings/primitives';
import { useAppStateContext } from '@/context/AppStateContext';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import { StudyTimeField } from '@/features/learning/components/goals/StudyTimeField';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import { useGoalSummary } from '@/features/learning/goals/useGoalSummary';
import { useSaveStudyGoal } from '@/features/learning/goals/useSaveStudyGoal';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import {
  defaultGoalWeekdays,
  normalizeGoalWeekdays,
  type StudyPacing,
} from '@/packages/domain/goals/goal';
import { syncUserData } from '@/lib/sync';
import {
  reminderPermissionEnablesReminders,
  requestStudyReminderPermission,
  unsubscribeFromStudyWebPush,
} from '@/features/learning/goals/web-push';

/**
 * The settings panel deliberately uses the same card as first-time setup.
 * Keeping a second set of presets, toggles and validation here made the goal
 * feel like a different feature depending on where it was edited.
 *
 * The on/off switch lives here and only here. Setup asks for a goal because a
 * learner meeting the app for the first time has nothing to say no to yet;
 * afterwards, running without one is a legitimate way to use the app, and this
 * is where that choice is made and unmade.
 */
export function StudyGoalSection({ minigameFrequency }: { minigameFrequency: MinigameFrequencyRange }) {
  const { t } = useI18n();
  const { revealMode, learningFineTune, userId } = useAppStateContext();
  const { summary, refresh } = useGoalSummary(true, userId ?? 'anonymous');
  const [reminderPending, setReminderPending] = useState(false);
  const editing = summary?.goal.pending ?? summary?.goal.active ?? null;
  const reminderEnabled = summary?.reminder.enabled ?? true;
  const reminderMinutes = summary?.reminder.localMinutes ?? 19 * 60;
  const pacing = useMemo<StudyPacing>(() => ({
    revealMode,
    minigameFrequency,
    fineTune: normalizeFineTuneConfig(learningFineTune),
  }), [learningFineTune, minigameFrequency, revealMode]);
  const { save, pending } = useSaveStudyGoal({
    revision: summary?.goal.revision,
    pacing,
    onSaved: refresh,
  });
  const isPending = pending || reminderPending;
  // What the learner last chose, which is the scheduled version when there is
  // one — the same version the picker below edits, so the switch and the dial
  // never describe two different goals.
  const goalOn = editing?.enabled === true;

  /**
   * Flip the goal on or off without touching its shape, so switching it back on
   * restores the rhythm the learner had rather than a default.
   *
   * Like every other goal write this takes effect from the next local day: a
   * day's targets are frozen once it starts, precisely so a change made this
   * afternoon cannot retroactively earn or un-earn today.
   */
  const saveEnabled = (enabled: boolean) => {
    if (!editing) return;
    void save({
      mode: editing.mode,
      daysPerWeek: editing.daysPerWeek,
      weekdays: normalizeGoalWeekdays(editing.weekdays) ?? defaultGoalWeekdays(editing.daysPerWeek),
      minutesPerDay: editing.minutesPerDay,
      newWordsPerDay: editing.newWordsPerDay ?? 5,
    }, { preset: editing.preset, enabled });
  };

  const saveReminder = async (enabled: boolean, localMinutes = reminderMinutes) => {
    if (!summary || isPending) return;
    setReminderPending(true);
    try {
      // Permission alone is not enough: without a native or web-push transport
      // there is nothing that can deliver a reminder while the app is closed,
      // so the saved toggle must reflect the capability that actually exists.
      const effectiveEnabled = enabled
        ? reminderPermissionEnablesReminders(await requestStudyReminderPermission())
        : false;
      await syncUserData({
        goal_reminder_enabled: effectiveEnabled,
        goal_reminder_local_minutes: localMinutes,
        goal_reminder_intro_answered: true,
      }, { emitEvent: false });
      if (!effectiveEnabled) void unsubscribeFromStudyWebPush();
      window.dispatchEvent(new Event('get-word:reschedule-reminders'));
      await refresh();
    } catch (error) {
      console.error('[study-goal] failed to save reminder:', error);
    } finally {
      setReminderPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold text-text">{t('settings.studyGoal')}</p>
          <p className="m-0 text-xs text-text-soft">
            {goalOn ? t('settings.studyGoalOnHint') : t('settings.studyGoalIntro')}
          </p>
        </div>
        <ToggleSwitch
          checked={goalOn}
          onChange={saveEnabled}
          ariaLabel={t('settings.studyGoalToggle')}
          disabled={!editing || isPending}
        />
      </div>

      {/* A change always starts on the next local day, so say which one rather
          than leaving the learner to wonder why today did not move. */}
      {summary?.goal.pending ? (
        <p className="m-0 text-xs text-accent">
          {t('settings.studyGoalScheduled', { day: summary.goal.pending.effectiveFromDay })}
        </p>
      ) : null}

      {goalOn ? (
        <StudyGoalSetupCard
          // The picker snapshots `initial` into its own state on mount, and the
          // summary arrives one fetch later. Without a key tied to it the panel
          // would keep showing the default goal for a learner who already has
          // one — and saving would write that default over their real goal.
          key={summary ? `goal-${summary.goal.revision}` : 'goal-loading'}
          compact
          pacing={pacing}
          pending={!summary || isPending}
          initial={{
            mode: editing?.mode ?? 'words',
            daysPerWeek: editing?.daysPerWeek ?? 7,
            weekdays: normalizeGoalWeekdays(editing?.weekdays) ?? undefined,
            minutesPerDay: editing?.minutesPerDay ?? 10,
            newWordsPerDay: editing?.newWordsPerDay ?? 5,
          }}
          onSave={(value) => void save(value, { preset: 'custom' })}
          title={t('goal.editTitle')}
          body={t('goal.editBody')}
          submitLabel={t('goal.editSubmit')}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <div>
          <p className="m-0 text-xs font-semibold text-text">{t('settings.studyGoalReminder')}</p>
          <p className="m-0 text-xs text-text-soft">{t('settings.studyGoalReminderHint')}</p>
        </div>
        <ToggleSwitch
          checked={reminderEnabled}
          onChange={(enabled) => void saveReminder(enabled)}
          ariaLabel={t('settings.studyGoalReminder')}
          disabled={!summary || isPending}
        />
      </div>
      {reminderEnabled ? (
        <div className="flex items-center justify-between gap-3 text-xs text-text-soft">
          <span>{t('settings.studyGoalReminderTime')}</span>
          <div className="w-32 shrink-0">
            <StudyTimeField
              label={t('settings.studyGoalReminderTime')}
              value={reminderMinutes}
              disabled={!summary || isPending}
              onChange={(value) => void saveReminder(true, value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
