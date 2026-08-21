'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { resolveGoalTargets } from '@/packages/domain/goals/calibration';
import { clampGoalDays, clampGoalMinutes, clampGoalWords, type GoalMode, type StudyPacing } from '@/packages/domain/goals/goal';

export type GoalPickerValue = {
  mode: GoalMode;
  daysPerWeek: number;
  minutesPerDay: number;
  newWordsPerDay: number;
};

export function StudyGoalPicker({
  pacing,
  initial,
  onSubmit,
  pending = false,
  submitLabel,
}: {
  pacing: StudyPacing;
  initial?: Partial<GoalPickerValue>;
  onSubmit: (value: GoalPickerValue) => void;
  pending?: boolean;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<GoalMode>(initial?.mode ?? 'words');
  const [daysPerWeek, setDaysPerWeek] = useState(initial?.daysPerWeek ?? 4);
  const [minutesPerDay, setMinutesPerDay] = useState(initial?.minutesPerDay ?? 10);
  const [newWordsPerDay, setNewWordsPerDay] = useState(initial?.newWordsPerDay ?? 10);
  const estimate = useMemo(() => resolveGoalTargets({
    mode, minutesPerDay, wordsPerDay: mode === 'words' ? newWordsPerDay : 0,
    newWordsPerDay: mode === 'words' ? newWordsPerDay : null, pacing,
  }), [minutesPerDay, mode, newWordsPerDay, pacing]);
  const monthly = Math.round((mode === 'words' ? newWordsPerDay : estimate.desiredNew) * daysPerWeek * 52 / 12);

  return (
    <section className="mx-auto w-full max-w-lg rounded-2xl bg-[#fff8e8] p-5 text-[#2a2218] shadow-sm">
      <div role="radiogroup" aria-label="Cíl studia" className="flex gap-2">
        {(['words', 'minutes'] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${mode === value ? 'bg-[#2a2218] text-white' : 'bg-[#eadfc8] text-[#2a2218]'}`}>
            {value === 'words' ? 'Slovíčka' : 'Čas'}
          </button>
        ))}
      </div>
      <label className="mt-5 block text-sm font-bold">
        {mode === 'words' ? 'Nových slov denně' : t('settings.studyGoalMinutes', { minutes: minutesPerDay })}
        <input className="mt-2 block w-full accent-[#a95e2a]" type="range"
          min={mode === 'words' ? 1 : 1} max={mode === 'words' ? 30 : 60}
          value={mode === 'words' ? newWordsPerDay : minutesPerDay}
          onChange={(event) => mode === 'words'
            ? setNewWordsPerDay(clampGoalWords(Number(event.target.value)))
            : setMinutesPerDay(clampGoalMinutes(Number(event.target.value)))} />
        <strong className="mt-1 block text-3xl tabular-nums">
          {mode === 'words' ? newWordsPerDay : minutesPerDay}{mode === 'words' ? '' : ' min'}
        </strong>
      </label>
      <label className="mt-5 block text-sm font-bold">
        {t('settings.studyGoalDays', { days: daysPerWeek })}
        <input className="mt-2 block w-full accent-[#a95e2a]" type="range" min={1} max={7} value={daysPerWeek}
          onChange={(event) => setDaysPerWeek(clampGoalDays(Number(event.target.value)))} />
      </label>
      <p className="mt-5 text-sm leading-relaxed text-[#5a4937]">
        {mode === 'words'
          ? `${newWordsPerDay} nových + ~${estimate.desiredReviewTarget} opakování · asi ${estimate.minutesPerDay} min denně · až ~${monthly} slov za měsíc`
          : `Asi ${estimate.itemBudget} položek za session · ${estimate.minutesPerDay} min denně`}
      </p>
      <button type="button" disabled={pending} onClick={() => onSubmit({ mode, daysPerWeek, minutesPerDay, newWordsPerDay })}
        className="onboarding-option onboarding-option-highlight mt-5 w-full rounded-xl px-5 py-3 text-base font-extrabold disabled:opacity-50">
        {submitLabel ?? t('settings.studyGoalSave')}
      </button>
    </section>
  );
}
