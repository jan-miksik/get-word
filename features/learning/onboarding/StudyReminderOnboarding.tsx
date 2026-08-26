'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { StudyTimeField } from '@/features/learning/components/goals/StudyTimeField';
import { OnboardingBody, OnboardingScreen, OnboardingTitle } from './OnboardingScreen';
import {
  reminderPermissionEnablesReminders,
  requestStudyReminderPermission,
  type StudyReminderPermissionResult,
} from '@/features/learning/goals/web-push';
import type { I18nKey } from '@/lib/i18n/locales/en';

/**
 * Why the learner is looking at a notice instead of a finished step. Every
 * outcome except a plain grant lands here, and each one asks something
 * different of them — so each one says what actually happened rather than
 * blaming the device.
 */
type ReminderNotice = Exclude<StudyReminderPermissionResult, 'granted'>;

const NOTICE_COPY: Record<ReminderNotice, { title: I18nKey; body: I18nKey }> = {
  unconfigured: {
    title: 'goal.reminderUnconfiguredTitle',
    body: 'goal.reminderUnconfiguredBody',
  },
  'granted-local': {
    title: 'goal.reminderLocalOnlyTitle',
    body: 'goal.reminderLocalOnlyBody',
  },
  denied: {
    title: 'goal.reminderPermissionDeniedTitle',
    body: 'goal.reminderPermissionDeniedBody',
  },
  dismissed: {
    title: 'goal.reminderPermissionDismissedTitle',
    body: 'goal.reminderPermissionDismissedBody',
  },
  'insecure-context': {
    title: 'goal.reminderInsecureTitle',
    body: 'goal.reminderInsecureBody',
  },
  unsupported: {
    title: 'goal.reminderUnsupportedTitle',
    body: 'goal.reminderUnsupportedBody',
  },
};

function BellIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="onboarding-step-icon" fill="none">
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
  onBack,
  onComplete,
  requestPermission = requestStudyReminderPermission,
}: {
  initialMinutes?: number;
  pending?: boolean;
  /** Shown only while this card is a step of first-time setup. */
  showProgress?: boolean;
  /** Back to the goal. Omitted when this card is not part of a flow. */
  onBack?: () => void;
  onComplete: (value: ReminderOnboardingValue) => void | Promise<void>;
  requestPermission?: () => Promise<StudyReminderPermissionResult>;
}) {
  const { t } = useI18n();
  const [localMinutes, setLocalMinutes] = useState(initialMinutes);
  const [permissionPending, setPermissionPending] = useState(false);
  const [permissionResult, setPermissionResult] = useState<ReminderNotice | null>(null);
  // Permission is not enough: only a result with a real delivery transport may
  // persist reminders as enabled.
  const remindersAllowed =
    permissionResult !== null && reminderPermissionEnablesReminders(permissionResult);
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
      // A throw this late is a failing request, not a missing capability: if the
      // browser has already said yes, say so instead of calling it unsupported.
      setPermissionResult(
        typeof Notification !== 'undefined' && Notification.permission === 'granted'
          ? 'granted-local'
          : 'unsupported',
      );
    } finally {
      setPermissionPending(false);
    }
  };

  return (
    <OnboardingScreen
      step={showProgress ? 'reminder' : null}
      onBack={onBack}
      contentClassName="text-center"
    >
      <BellIcon />
      <OnboardingTitle className="mb-2 mt-4">{t('goal.reminderOnboardingTitle')}</OnboardingTitle>
      <OnboardingBody className="mx-auto mb-6 max-w-md">
        {t('goal.reminderOnboardingBody')}
      </OnboardingBody>

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
            {t(NOTICE_COPY[permissionResult].title)}
          </p>
          <p className="mb-0 mt-1">{t(NOTICE_COPY[permissionResult].body)}</p>
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (permissionResult) void onComplete({ enabled: remindersAllowed, localMinutes });
          else void enable();
        }}
        className="onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent)_28%,transparent)] active:translate-y-0 disabled:cursor-wait disabled:opacity-50"
      >
        {permissionPending
          ? t('goal.reminderPermissionPending')
          : remindersAllowed
            ? t('onboarding.continue')
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
    </OnboardingScreen>
  );
}
