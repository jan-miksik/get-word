'use client';

import type { StudyPacing } from '@/packages/domain/goals/goal';
import { StudyGoalPicker } from './StudyGoalPicker';
import type { GoalPickerValue } from './StudyGoalPicker';

export function StudyGoalSetupCard({
  pacing,
  onSave,
  onSkip,
  pending,
}: {
  pacing: StudyPacing;
  onSave: (value: GoalPickerValue) => void;
  onSkip: () => void;
  pending?: boolean;
}) {
  return (
    <main className="flex min-h-full w-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg text-center">
        <p className="m-0 text-4xl" aria-hidden>🎯</p>
        <h1 className="mb-2 mt-3 text-3xl font-black text-[#2a2218]">Nastav si studijní rytmus</h1>
        <p className="mx-auto mb-5 max-w-md text-sm leading-relaxed text-[#594631]">
          Vyber si, kolik nových slov nebo času chceš studiu věnovat. Cíl můžeš kdykoli změnit.
        </p>
        <StudyGoalPicker pacing={pacing} onSubmit={onSave} pending={pending} submitLabel="Nastavit cíl" />
        <button type="button" disabled={pending} onClick={onSkip}
          className="mt-3 text-sm font-bold text-[#6d5840] underline disabled:opacity-50">
          Zatím ne
        </button>
      </div>
    </main>
  );
}
