'use client';

import { useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import type { GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';
import {
  StudyReminderOnboarding,
  type ReminderOnboardingValue,
} from '@/features/learning/onboarding/StudyReminderOnboarding';
import { LanguageLevelOnboarding } from '@/features/learning/onboarding/LanguageLevelOnboarding';
import { OnboardingProgress } from '@/features/learning/onboarding/OnboardingProgress';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import type { StudyPacing } from '@/packages/domain/goals/goal';
import type { StudyReminderPermissionResult } from '@/features/learning/goals/web-push';

type Scenario = 'fresh' | 'returning-no-goal' | 'resume-reminder' | 'permission-denied' | 'unsupported';
type Step = 'language' | 'level' | 'goal' | 'reminder' | 'words' | 'done';

const pacing: StudyPacing = {
  revealMode: 'press',
  minigameFrequency: 'off',
  fineTune: normalizeFineTuneConfig(undefined),
};

const scenarioStart: Record<Scenario, Step> = {
  fresh: 'language',
  'returning-no-goal': 'goal',
  'resume-reminder': 'reminder',
  'permission-denied': 'reminder',
  unsupported: 'reminder',
};

function permissionFor(scenario: Scenario): StudyReminderPermissionResult {
  if (scenario === 'permission-denied') return 'denied';
  if (scenario === 'unsupported') return 'unsupported';
  return 'granted';
}

function PreludeCard({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={warmPaletteVars}
      className="flex min-h-[100dvh] items-center justify-center bg-[#F4EFE2] px-4 py-8 text-[#2A2218]"
    >
      <section className="w-full max-w-2xl rounded-[2rem] border border-[#DED2BD] bg-[#FFF8E8] p-6 shadow-[0_20px_60px_rgba(73,58,37,0.13)] sm:p-8">
        {children}
      </section>
    </main>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 w-full rounded-2xl bg-[#1E6FA8] px-5 py-3.5 text-base font-extrabold text-white shadow-[0_10px_24px_rgba(30,111,168,0.24)]"
    >
      {children}
    </button>
  );
}

export function OnboardingDevPreview({ initialScenario = 'fresh' }: { initialScenario?: Scenario }) {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [step, setStep] = useState<Step>(scenarioStart[initialScenario]);
  const [level, setLevel] = useState('A0');
  const [goal, setGoal] = useState<GoalPickerValue | null>(null);
  const [reminder, setReminder] = useState<ReminderOnboardingValue | null>(null);

  const reset = (next: Scenario) => {
    setScenario(next);
    setStep(scenarioStart[next]);
    setLevel('A0');
    setGoal(null);
    setReminder(null);
  };

  let content: React.ReactNode;
  if (step === 'language') {
    content = (
      <PreludeCard>
        <OnboardingProgress step="language" />
        <h1 className="mb-2 mt-3 text-3xl font-black">Co znáš a co se chceš naučit?</h1>
        <p className="text-sm text-[#6B5E48]">Fixture používá češtinu jako známý jazyk a španělštinu jako studovaný jazyk.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-[#D8CDBB] bg-[#FFFDF7] p-4">
            <span className="text-xs font-bold text-[#6B5E48]">Znám</span>
            <strong className="mt-1 block text-lg">Čeština</strong>
          </div>
          <div className="rounded-2xl border-2 border-[#1E6FA8] bg-[#EAF3F8] p-4">
            <span className="text-xs font-bold text-[#6B5E48]">Učím se</span>
            <strong className="mt-1 block text-lg">Španělština</strong>
          </div>
        </div>
        <PrimaryButton onClick={() => setStep('level')}>Pokračovat</PrimaryButton>
      </PreludeCard>
    );
  } else if (step === 'level') {
    content = (
      <LanguageLevelOnboarding
        targetLanguage="es"
        initialLevel="A0"
        onSubmit={(next) => {
          setLevel(next);
          setStep('goal');
        }}
      />
    );
  } else if (step === 'goal') {
    content = (
      <StudyGoalSetupCard
        pacing={pacing}
        showProgress
        onSave={(value) => {
          setGoal(value);
          setStep('reminder');
        }}
      />
    );
  } else if (step === 'reminder') {
    content = (
      <StudyReminderOnboarding
        showProgress
        requestPermission={async () => permissionFor(scenario)}
        onComplete={(value) => {
          setReminder(value);
          setStep('words');
        }}
      />
    );
  } else if (step === 'words') {
    content = (
      <PreludeCard>
        <OnboardingProgress step="words" />
        <h1 className="mb-2 mt-3 text-3xl font-black">Přidáme první slovíčka</h1>
        <p className="text-sm leading-relaxed text-[#6B5E48]">
          V reálném onboardingu je tady konverzace, která ze zjištěného jazyka, úrovně a cíle
          sestaví první seznam. Náhled jen simuluje úspěšné dokončení bez API a bez zápisu.
        </p>
        <PrimaryButton onClick={() => setStep('done')}>Simulovat vytvoření seznamu</PrimaryButton>
      </PreludeCard>
    );
  } else {
    content = (
      <PreludeCard>
        <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-[#15803D]">Onboarding dokončen</p>
        <h1 className="mb-2 mt-3 text-3xl font-black">Hotovo</h1>
        <p className="text-sm text-[#6B5E48]">Nebylo nic zapsáno do databáze a neotevřel se skutečný systémový dialog.</p>
        <pre className="mt-5 overflow-x-auto rounded-2xl bg-[#2A2218] p-4 text-left text-xs text-[#FFF8E8]">
          {JSON.stringify({ scenario, level, goal, reminder }, null, 2)}
        </pre>
        <PrimaryButton onClick={() => reset(scenario)}>Spustit znovu</PrimaryButton>
      </PreludeCard>
    );
  }

  return (
    <I18nProvider language="cs">
      <div className="relative">
        <aside className="fixed left-3 top-3 z-[100] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-xl border border-[#CBBEA6] bg-[#FFFDF7]/95 p-2 text-xs text-[#2A2218] shadow-lg backdrop-blur">
          <label className="font-bold" htmlFor="onboarding-scenario">Scénář</label>
          <select
            id="onboarding-scenario"
            value={scenario}
            onChange={(event) => reset(event.target.value as Scenario)}
            className="min-w-0 rounded-lg border border-[#CBBEA6] bg-white px-2 py-1 font-semibold"
          >
            <option value="fresh">Nový účet</option>
            <option value="returning-no-goal">Hotový onboarding bez cíle</option>
            <option value="resume-reminder">Obnovení u notifikací</option>
            <option value="permission-denied">Notifikace zamítnuty</option>
            <option value="unsupported">Notifikace nepodporovány</option>
          </select>
        </aside>
        {content}
      </div>
    </I18nProvider>
  );
}
