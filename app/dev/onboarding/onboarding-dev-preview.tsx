'use client';

import { useEffect, useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import type { GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';
import {
  StudyReminderOnboarding,
  type ReminderOnboardingValue,
} from '@/features/learning/onboarding/StudyReminderOnboarding';
import { LanguageLevelOnboarding } from '@/features/learning/onboarding/LanguageLevelOnboarding';
import {
  OnboardingBody,
  OnboardingScreen,
  OnboardingTitle,
} from '@/features/learning/onboarding/OnboardingScreen';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import type { StudyPacing } from '@/packages/domain/goals/goal';
import type { StudyReminderPermissionResult } from '@/features/learning/goals/web-push';
import { type PreviewStep } from './steps';

type Scenario =
  | 'fresh'
  | 'returning-no-goal'
  | 'resume-reminder'
  | 'permission-denied'
  | 'permission-dismissed'
  | 'push-unavailable'
  | 'insecure-context'
  | 'unsupported';

const pacing: StudyPacing = {
  revealMode: 'press',
  minigameFrequency: 'off',
  fineTune: normalizeFineTuneConfig(undefined),
};

const scenarioStart: Record<Scenario, PreviewStep> = {
  fresh: 'language',
  'returning-no-goal': 'goal',
  'resume-reminder': 'reminder',
  'permission-denied': 'reminder',
  'permission-dismissed': 'reminder',
  'push-unavailable': 'reminder',
  'insecure-context': 'reminder',
  unsupported: 'reminder',
};

function permissionFor(scenario: Scenario): StudyReminderPermissionResult {
  if (scenario === 'permission-denied') return 'denied';
  if (scenario === 'permission-dismissed') return 'dismissed';
  // Notifications work, only background push does not — the Brave case.
  if (scenario === 'push-unavailable') return 'granted-local';
  if (scenario === 'insecure-context') return 'insecure-context';
  if (scenario === 'unsupported') return 'unsupported';
  return 'granted';
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold"
    >
      {children}
    </button>
  );
}

/**
 * Reports the viewport the preview is being judged in. The goal step is the one
 * that has to survive a short laptop window without hiding its Save button, and
 * "does it fit?" is unanswerable without knowing the height it has to fit in.
 */
function ViewportReadout() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const read = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  if (!size) return null;
  return (
    <span className="font-mono tabular-nums">
      {size.w}×{size.h}
    </span>
  );
}

export function OnboardingDevPreview({
  initialScenario = 'fresh',
  initialStep,
}: {
  initialScenario?: Scenario;
  initialStep?: PreviewStep;
}) {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [step, setStep] = useState<PreviewStep>(initialStep ?? scenarioStart[initialScenario]);
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

  // The preview walks the steps in order, so Back here is simply the step
  // before — the real flow derives it from stored answers instead.
  const back: Partial<Record<PreviewStep, PreviewStep>> = {
    level: 'language',
    goal: 'level',
    reminder: 'goal',
    words: 'reminder',
  };
  const backTo = back[step];
  const onBack = backTo ? () => setStep(backTo) : undefined;

  let content: React.ReactNode;
  if (step === 'language') {
    content = (
      <OnboardingScreen step="language" width="wide">
        <OnboardingTitle className="mb-2 mt-3">Co znáš a co se chceš naučit?</OnboardingTitle>
        <OnboardingBody>
          Fixture používá češtinu jako známý jazyk a španělštinu jako studovaný jazyk. Skutečná
          obrazovka tu má výběr jazyků, který si tahá seznam ze serveru.
        </OnboardingBody>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="onboarding-option px-4 py-3 text-left">
            <span className="text-xs font-bold onboarding-text-soft">Znám</span>
            <strong className="mt-1 block text-lg">Čeština</strong>
          </div>
          <div className="onboarding-option onboarding-option-recommended px-4 py-3 text-left">
            <span className="text-xs font-bold onboarding-text-soft">Učím se</span>
            <strong className="mt-1 block text-lg">Španělština</strong>
          </div>
        </div>
        <PrimaryButton onClick={() => setStep('level')}>Pokračovat</PrimaryButton>
      </OnboardingScreen>
    );
  } else if (step === 'level') {
    content = (
      <LanguageLevelOnboarding
        targetLanguage="es"
        initialLevel="A0"
        onBack={onBack}
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
        onBack={onBack}
        initial={goal ?? undefined}
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
        onBack={onBack}
        initialMinutes={reminder?.localMinutes}
        requestPermission={async () => permissionFor(scenario)}
        onComplete={(value) => {
          setReminder(value);
          setStep('words');
        }}
      />
    );
  } else if (step === 'words') {
    content = (
      <OnboardingScreen step="words" width="wide" onBack={onBack}>
        <OnboardingTitle className="mb-2 mt-3">Přidáme první slovíčka</OnboardingTitle>
        <OnboardingBody>
          V reálném onboardingu je tady konverzace, která ze zjištěného jazyka, úrovně a cíle
          sestaví první seznam. Náhled jen simuluje úspěšné dokončení bez API a bez zápisu.
        </OnboardingBody>
        <PrimaryButton onClick={() => setStep('done')}>Simulovat vytvoření seznamu</PrimaryButton>
      </OnboardingScreen>
    );
  } else {
    content = (
      <OnboardingScreen width="wide">
        <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--ob-accent)]">
          Onboarding dokončen
        </p>
        <OnboardingTitle className="mb-2 mt-3">Hotovo</OnboardingTitle>
        <OnboardingBody>
          Nebylo nic zapsáno do databáze a neotevřel se skutečný systémový dialog.
        </OnboardingBody>
        <pre className="mt-5 overflow-x-auto rounded-2xl bg-[color:var(--ob-ink)] p-4 text-left text-xs text-[color:var(--ob-surface-hover)]">
          {JSON.stringify({ scenario, level, goal, reminder }, null, 2)}
        </pre>
        <PrimaryButton onClick={() => reset(scenario)}>Spustit znovu</PrimaryButton>
      </OnboardingScreen>
    );
  }

  return (
    <I18nProvider language="cs">
      <div className="relative">
        <aside className="fixed left-3 top-3 z-[100] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-xl border border-[#CBBEA6] bg-[#FFFDF7]/95 p-2 text-xs text-[#2A2218] shadow-lg backdrop-blur">
          <label className="font-bold" htmlFor="onboarding-step">Krok</label>
          <select
            id="onboarding-step"
            value={step}
            onChange={(event) => setStep(event.target.value as PreviewStep)}
            className="min-w-0 rounded-lg border border-[#CBBEA6] bg-white px-2 py-1 font-semibold"
          >
            <option value="language">1 · Jazyky</option>
            <option value="level">2 · Úroveň</option>
            <option value="goal">3 · Cíl</option>
            <option value="reminder">4 · Notifikace</option>
            <option value="words">5 · Slovíčka</option>
            <option value="done">Hotovo</option>
          </select>
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
            <option value="permission-dismissed">Dotaz zavřen bez odpovědi</option>
            <option value="push-unavailable">Bez push na pozadí (Brave)</option>
            <option value="insecure-context">Bez https</option>
            <option value="unsupported">Notifikace nepodporovány</option>
          </select>
          <ViewportReadout />
        </aside>
        {content}
      </div>
    </I18nProvider>
  );
}
