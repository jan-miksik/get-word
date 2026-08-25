'use client';

import { useState } from 'react';
import { PREVIEW_STEPS, type PreviewStep } from '../steps';

/**
 * Every onboarding step at a fixed window size, side by side.
 *
 * The screens that break are the ones nobody looks at in the size they break
 * in: a phone, and — the reason this page exists — a short laptop window, where
 * the goal step's Save button is the first thing to fall under the fold. An
 * iframe is an honest viewport, so `100dvh`, the `vh` clamp on the dial and the
 * container queries all resolve against the frame rather than the display.
 */
const DEVICES = [
  { id: 'phone', label: 'Telefon · 390×844', width: 390, height: 844 },
  { id: 'laptop-short', label: 'Nízký laptop · 1280×640', width: 1280, height: 640 },
  { id: 'laptop', label: 'Laptop · 1280×720', width: 1280, height: 720 },
  { id: 'desktop', label: 'Desktop · 1440×900', width: 1440, height: 900 },
  { id: 'tablet', label: 'Tablet · 834×1112', width: 834, height: 1112 },
] as const;

const STEP_LABELS: Record<PreviewStep, string> = {
  language: '1 · Jazyky',
  level: '2 · Úroveň',
  goal: '3 · Cíl',
  reminder: '4 · Notifikace',
  words: '5 · Slovíčka',
  done: 'Hotovo',
};

export function OnboardingFrames() {
  const [deviceId, setDeviceId] = useState<(typeof DEVICES)[number]['id']>('laptop-short');
  const [step, setStep] = useState<PreviewStep>('goal');
  const [allSteps, setAllSteps] = useState(false);
  const device = DEVICES.find((entry) => entry.id === deviceId) ?? DEVICES[0];
  const steps = allSteps ? PREVIEW_STEPS.filter((entry) => entry !== 'done') : [step];

  return (
    <main className="min-h-screen bg-[#060A18] p-4 text-[#E8ECF5] sm:p-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <header className="flex flex-wrap items-center gap-3 text-sm">
          <h1 className="m-0 mr-2 text-base font-black">Onboarding — rámečky</h1>
          <label className="font-bold" htmlFor="frame-device">Zařízení</label>
          <select
            id="frame-device"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value as typeof deviceId)}
            className="rounded-lg border border-[#3A4560] bg-[#101728] px-2 py-1 font-semibold"
          >
            {DEVICES.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
          <label className="font-bold" htmlFor="frame-step">Krok</label>
          <select
            id="frame-step"
            value={step}
            disabled={allSteps}
            onChange={(event) => setStep(event.target.value as PreviewStep)}
            className="rounded-lg border border-[#3A4560] bg-[#101728] px-2 py-1 font-semibold disabled:opacity-40"
          >
            {PREVIEW_STEPS.map((entry) => (
              <option key={entry} value={entry}>{STEP_LABELS[entry]}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={allSteps}
              onChange={(event) => setAllSteps(event.target.checked)}
            />
            Všechny kroky
          </label>
          <p className="m-0 ml-auto text-xs text-[#8E9AB5]">
            Scénáře (zamítnuté notifikace apod.) přepínáš v liště uvnitř rámečku.
          </p>
        </header>

        <div className="flex flex-wrap items-start gap-6">
          {steps.map((entry) => (
            <figure key={entry} className="m-0 flex flex-col gap-2">
              <figcaption className="text-xs font-bold text-[#8E9AB5]">
                {STEP_LABELS[entry]}
              </figcaption>
              <div className="overflow-hidden rounded-[1.5rem] border-8 border-[#20283A] bg-[#F4EFE2] shadow-2xl">
                <iframe
                  title={`Onboarding — ${STEP_LABELS[entry]}`}
                  src={`/dev/onboarding/${entry}`}
                  style={{ width: device.width, height: device.height }}
                  className="block max-w-[calc(100vw-4rem)] border-0"
                />
              </div>
            </figure>
          ))}
        </div>
      </div>
    </main>
  );
}
