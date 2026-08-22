'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { StudyTimeField } from '@/features/learning/components/goals/StudyTimeField';
import { OnboardingProgress } from './OnboardingProgress';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import {
  requestStudyReminderPermission,
  type StudyReminderPermissionResult,
} from '@/features/learning/goals/web-push';

function BellIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="mx-auto h-14 w-14" fill="none">
      <circle cx="32" cy="32" r="29" fill="var(--ob-surface-hover, #FFF8E8)" stroke="var(--ob-ink, #2A2218)" strokeWidth="2" />
      <path d="M20 39h24c-3-3-4-7-4-13a8 8 0 0 0-16 0c0 6-1 10-4 13Z" fill="var(--ob-accent, #1E6FA8)" stroke="var(--ob-ink, #2A2218)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M28 43a4 4 0 0 0 8 0" stroke="var(--ob-ink, #2A2218)" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 14v3" stroke="var(--ob-ink, #2A2218)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type ReminderOnboardingValue = {
  enabled: boolean;
  localMinutes: number;
};

export function StudyReminderOnboarding({
  initialMinutes = 19 * 60,
  pending = false,
  showProgress = false,
  onComplete,
  requestPermission = requestStudyReminderPermission,
}: {
  initialMinutes?: number;
  pending?: boolean;
  /** Shown only while this card is a step of first-time setup. */
  showProgress?: boolean;
  onComplete: (value: ReminderOnboardingValue) => void | Promise<void>;
  requestPermission?: () => Promise<StudyReminderPermissionResult>;
}) {
  const { t } = useI18n();
  const [localMinutes, setLocalMinutes] = useState(initialMinutes);
  const [permissionPending, setPermissionPending] = useState(false);
  const [permissionResult, setPermissionResult] =
    useState<Exclude<StudyReminderPermissionResult, 'granted'> | null>(null);
  const disabled = pending || permissionPending;

  const enable = async () => {
    if (disabled) return;
    setPermissionPending(true);
    try {
      const result = await requestPermission();
      if (result === 'granted') {
        await onComplete({ enabled: true, localMinutes });
        return;
      }
      setPermissionResult(result);
    } catch {
      setPermissionResult('unsupported');
    } finally {
      setPermissionPending(false);
    }
  };

  return (
    <main
      style={warmPaletteVars}
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[color:var(--ob-surface)] px-4 py-8 text-[color:var(--ob-ink)] sm:py-12"
    >
      <section className="onboarding-card w-full max-w-lg p-5 text-center sm:p-7">
        {showProgress ? <OnboardingProgress step="reminder" /> : null}
        <BellIcon />
        <h1 className="mb-2 mt-4 text-3xl font-black">{t('goal.reminderOnboardingTitle')}</h1>
        <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-[color:var(--ob-ink-soft)]">
          {t('goal.reminderOnboardingBody')}
        </p>

        <div className="mx-auto max-w-xs text-left text-sm font-extrabold">
          <p className="m-0 mb-2">{t('settings.studyGoalReminderTime')}</p>
          <StudyTimeField
            label={t('settings.studyGoalReminderTime')}
            value={localMinutes}
            disabled={disabled}
            onChange={setLocalMinutes}
          />
        </div>

        {permissionResult ? (
          <div role="status" className="onboarding-notice mt-5 p-4 text-left text-sm text-[color:var(--ob-ink-soft)]">
            <p className="m-0 font-extrabold text-[color:var(--ob-ink)]">
              {t(permissionResult === 'denied'
                ? 'goal.reminderPermissionDeniedTitle'
                : 'goal.reminderUnsupportedTitle')}
            </p>
            <p className="mb-0 mt-1">
              {t(permissionResult === 'denied'
                ? 'goal.reminderPermissionDeniedBody'
                : 'goal.reminderUnsupportedBody')}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (permissionResult) void onComplete({ enabled: false, localMinutes });
            else void enable();
          }}
          className="onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent)_28%,transparent)] active:translate-y-0 disabled:cursor-wait disabled:opacity-50"
        >
          {permissionPending
            ? t('goal.reminderPermissionPending')
            : permissionResult
              ? t('goal.reminderContinueWithout')
              : t('goal.reminderEnable')}
        </button>
        {!permissionResult ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onComplete({ enabled: false, localMinutes })}
            className="mt-3 px-4 py-2 text-sm font-extrabold text-[color:var(--ob-ink-soft)] underline decoration-2 underline-offset-4 disabled:opacity-50"
          >
            {t('goal.reminderNotNow')}
          </button>
        ) : null}
      </section>
    </main>
  );
}
