'use client';

import { useMemo, useState } from 'react';
import { Section, ToggleSwitch } from '@/components/settings/primitives';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import { useGoalSummary } from '@/features/learning/goals/useGoalSummary';
import { StudyGoalHistory } from './StudyGoalHistory';
import { syncUserData } from '@/lib/sync';
import { currentIanaTimezone } from '@/lib/local-day';
import { requestReminderPermission } from '@/lib/notifications/runtime';
import { subscribeToStudyWebPush, unsubscribeFromStudyWebPush } from '@/features/learning/goals/web-push';
import { calculateWordGoal, resolveGoalTargets, sessionItemCapFromWordGoal } from '@/packages/domain/goals/calibration';
import { clampGoalDays, clampGoalMinutes, type GoalPreset, type StudyPacing } from '@/packages/domain/goals/goal';
import { StudyGoalPicker } from '@/features/learning/components/goals/StudyGoalPicker';

type GoalShape = { days: number; minutes: number; preset: GoalPreset; mode?: 'words' | 'minutes'; newWords?: number };

const PRESETS: Array<GoalShape & { id: Exclude<GoalPreset, 'custom'> }> = [
  { id: 'light', preset: 'light', days: 3, minutes: 5 },
  { id: 'medium', preset: 'medium', days: 4, minutes: 10 },
  { id: 'intense', preset: 'intense', days: 5, minutes: 20 },
];

/** The new-word floor `planSession` reserves; shown so the split is not a mystery. */
const NEW_SHARE_MIN = 0.2;

function formatLocalTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function parseLocalTime(value: string): number | null {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const total = hours * 60 + minutes;
  return total >= 0 && total < 24 * 60 ? total : null;
}

export function StudyGoalSection({ minigameFrequency }: { minigameFrequency: MinigameFrequencyRange }) {
  const { t } = useI18n();
  const { revealMode, learningFineTune, userId } = useAppStateContext();
  const { summary, refresh } = useGoalSummary(true, userId ?? 'anonymous');
  const [pending, setPending] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const active = summary?.goal.active ?? null;
  const pendingGoal = summary?.goal.pending ?? null;
  const reminderEnabled = summary?.reminder.enabled ?? true;
  const reminderMinutes = summary?.reminder.localMinutes ?? 19 * 60;

  // The goal the learner is editing: the scheduled change if there is one,
  // otherwise what is running today. Editing anything else would quietly
  // discard a change they already made.
  const editing = pendingGoal ?? active;
  const days = editing?.daysPerWeek ?? 4;
  const minutes = editing?.minutesPerDay ?? 10;
  const mode = editing?.mode ?? 'minutes';
  const newWords = editing?.newWordsPerDay ?? 10;

  const pacing = useMemo<StudyPacing>(() => ({
    revealMode,
    minigameFrequency,
    fineTune: normalizeFineTuneConfig(learningFineTune),
  }), [learningFineTune, minigameFrequency, revealMode]);

  /**
   * The same calculator the server runs on save, so the numbers on the buttons
   * are the numbers the learner will actually get — the estimate is a function
   * of their own pacing settings, not a constant.
   */
  const describe = (minutesPerDay: number) => {
    const { sessionItemCap } = calculateWordGoal(clampGoalMinutes(minutesPerDay), pacing);
    const fresh = Math.max(1, Math.ceil(sessionItemCap * NEW_SHARE_MIN));
    return { items: sessionItemCap, fresh, review: Math.max(0, sessionItemCap - fresh) };
  };

  const save = async (shape: GoalShape, enabled = true) => {
    if (!summary || pending) return;
    setPending(true);
    try {
      await syncUserData({
        study_goal: {
          enabled,
          mode: shape.mode ?? 'minutes',
          goal_days_per_week: clampGoalDays(shape.days),
          ...((shape.mode ?? 'minutes') === 'words'
            ? { goal_new_words_per_day: shape.newWords ?? 10 }
            : { goal_minutes_per_day: clampGoalMinutes(shape.minutes) }),
          goal_preset: shape.preset,
          reveal_mode: revealMode,
          minigame_frequency: minigameFrequency,
          learning_fine_tune: learningFineTune,
          timezone: currentIanaTimezone(),
        },
        study_goal_base_revision: summary.goal.revision,
      }, { emitEvent: false });
      if (enabled) {
        void requestReminderPermission();
        void subscribeToStudyWebPush();
      }
      window.dispatchEvent(new Event('get-word:reschedule-reminders'));
      await refresh();
    } catch (error) {
      console.error('[study-goal] failed to save goal:', error);
    } finally { setPending(false); }
  };

  const saveReminder = async (enabled: boolean, localMinutes = reminderMinutes) => {
    if (!summary || pending) return;
    setPending(true);
    try {
      await syncUserData({
        goal_reminder_enabled: enabled,
        goal_reminder_local_minutes: localMinutes,
      }, { emitEvent: false });
      if (enabled) {
        void requestReminderPermission();
        void subscribeToStudyWebPush();
      } else {
        void unsubscribeFromStudyWebPush();
      }
      window.dispatchEvent(new Event('get-word:reschedule-reminders'));
      await refresh();
    } catch (error) {
      console.error('[study-goal] failed to save reminder:', error);
    } finally { setPending(false); }
  };

  const goalOn = active?.enabled === true;
  const activePreset = editing?.preset ?? null;

  return (
    <Section
      label={t('settings.studyGoal')}
      action={(
        <ToggleSwitch
          checked={goalOn}
          onChange={(enabled) => void save(
            { days, minutes, mode, newWords, preset: activePreset ?? 'medium' },
            enabled,
          )}
          ariaLabel={t('settings.studyGoalToggle')}
          disabled={!summary || pending}
        />
      )}
    >
      <p className="m-0 text-xs text-text-soft">
        {goalOn && active
          ? active.mode === 'words'
            ? `${active.newWordsPerDay ?? 0} nových · ${resolveGoalTargets({ ...active, pacing: active.pacing as StudyPacing }).desiredReviewTarget} opakování · ${active.daysPerWeek}× týdně`
            : t('settings.studyGoalSummary', {
              minutes: active.minutesPerDay,
              // The active version is frozen. Recalculating it from today's
              // Fine Tune settings can advertise a different session length
              // from the one the planner actually uses.
              items: sessionItemCapFromWordGoal(active.wordsPerDay),
              days: active.daysPerWeek,
            })
          : t('settings.studyGoalIntro')}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => {
          const selected = goalOn && activePreset === preset.preset;
          const shape = describe(preset.minutes);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              disabled={!summary || pending}
              onClick={() => void save(preset)}
              className={[
                'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
                selected
                  ? 'border-accent bg-accent text-white'
                  : 'border-border-subtle bg-background-elevated text-text hover:border-accent',
                'disabled:cursor-wait',
              ].join(' ')}
            >
              {t(`settings.studyGoalPreset.${preset.id}` as 'settings.studyGoalPreset.light')}
              <span className={`block font-normal ${selected ? 'text-white/80' : 'text-text-soft'}`}>
                {preset.days}× · {preset.minutes} min
              </span>
              <span className={`block tabular-nums ${selected ? 'text-white/80' : 'text-text-soft'}`}>
                {t('settings.studyGoalSplit', { fresh: shape.fresh, review: shape.review })}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setCustomOpen((open) => !open)}
        aria-expanded={customOpen}
        className={[
          'self-start rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
          goalOn && activePreset === 'custom'
            ? 'border-accent bg-accent text-white'
            : 'border-border-subtle bg-background-elevated text-text hover:border-accent',
        ].join(' ')}
      >
        {t('settings.studyGoalCustom')}
      </button>

      {customOpen ? (
        <StudyGoalPicker
          pacing={pacing}
          pending={!summary || pending}
          initial={{ daysPerWeek: days, minutesPerDay: minutes, mode: editing?.mode ?? 'words', newWordsPerDay: editing?.newWordsPerDay ?? 10 }}
          onSubmit={(value) => void save({ days: value.daysPerWeek, minutes: value.minutesPerDay, newWords: value.newWordsPerDay, mode: value.mode, preset: 'custom' })}
        />
      ) : null}

      {pendingGoal ? (
        <p className="m-0 text-xs text-accent">
          {t('settings.studyGoalScheduled', { day: pendingGoal.effectiveFromDay })}
        </p>
      ) : null}

      {summary ? <StudyGoalHistory summary={summary} /> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <div>
          <p className="m-0 text-xs font-semibold text-text">{t('settings.studyGoalReminder')}</p>
          <p className="m-0 text-xs text-text-soft">{t('settings.studyGoalReminderHint')}</p>
        </div>
        <ToggleSwitch
          checked={reminderEnabled}
          onChange={(enabled) => void saveReminder(enabled)}
          ariaLabel={t('settings.studyGoalReminder')}
          disabled={!summary || pending}
        />
      </div>
      {reminderEnabled ? (
        <label className="flex items-center justify-between gap-3 text-xs text-text-soft">
          {t('settings.studyGoalReminderTime')}
          <input
            type="time"
            value={formatLocalTime(reminderMinutes)}
            disabled={!summary || pending}
            onChange={(event) => {
              const value = parseLocalTime(event.target.value);
              if (value !== null) void saveReminder(true, value);
            }}
            className="rounded-md border border-border-subtle bg-background px-2 py-1 text-text"
          />
        </label>
      ) : null}
    </Section>
  );
}
