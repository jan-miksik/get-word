'use client';

import { useMemo, useState } from 'react';

import { StudyGoalPicker, type GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';
import { simulateReviewLoad } from '@/packages/domain/goals/forecast';
import type { StudyPacing } from '@/packages/domain/goals/goal';

const pacing: StudyPacing = {
  revealMode: 'press', minigameFrequency: 'off', fineTune: { version: 3, stages: [] },
};

export function StudyGoalDevPreview() {
  const [goal, setGoal] = useState<GoalPickerValue>({ mode: 'words', daysPerWeek: 4, minutesPerDay: 10, newWordsPerDay: 10 });
  const forecast = useMemo(() => simulateReviewLoad({
    goal: { mode: goal.mode, minutesPerDay: goal.minutesPerDay, wordsPerDay: goal.mode === 'words' ? goal.newWordsPerDay : 0, newWordsPerDay: goal.mode === 'words' ? goal.newWordsPerDay : null, pacing },
    days: 14, availableNewWords: 180, dueReviewCount: 45, seed: 7,
  }), [goal]);
  const maximum = Math.max(1, ...forecast.map((row) => row.answerEvents));
  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-[#fffdf7] px-5 py-10 text-[#2a2218]">
      <h1 className="mb-2 text-3xl font-black">Study goal · dev preview</h1>
      <p className="mb-6 max-w-2xl text-sm text-[#735d43]">Setup, snapshotový countdown a seedovaný odhad. Sloupce ukazují skutečné answer eventy; plánované sloty jsou samostatná hodnota.</p>
      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <StudyGoalPicker pacing={pacing} initial={goal} onSubmit={setGoal} submitLabel="Aktualizovat simulaci" />
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="m-0 text-lg font-extrabold">Forecast na 14 dní</h2>
          <div className="mt-5 flex h-48 items-end gap-1" aria-label="Forecast answer events">
            {forecast.map((row) => <div key={row.day} className="flex min-w-0 flex-1 flex-col justify-end" title={`Den ${row.day}: ${row.answerEvents} odpovědí, ${row.plannedSlots} slotů`}>
              <div className="rounded-t bg-[#a95e2a]" style={{ height: `${(row.answerEvents / maximum) * 100}%` }} />
            </div>)}
          </div>
          <div className="mt-4 grid gap-1 text-xs text-[#5a4937]">
            {forecast.map((row) => <p key={row.day} className="m-0">Den {row.day}: {row.newTarget} nových + {row.reviewTarget} review · {row.plannedSlots} slotů · {row.answerEvents} odpovědí</p>)}
          </div>
        </section>
      </div>
    </main>
  );
}
