import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppInstallOnboardingStep } from '../AppInstallOnboardingStep';

const IOS_PLAN = {
  store: { target: 'appStore' as const, url: 'https://apps.apple.com/app/id6796635158' },
  offerHomeScreen: false,
};
const ANDROID_PLAN = {
  store: { target: 'play' as const, url: 'https://play.google.com/store/apps/details?id=app.getword' },
  offerHomeScreen: true,
};

describe('AppInstallOnboardingStep', () => {
  it('sends an iPhone to the App Store and offers no home-screen path', () => {
    render(<AppInstallOnboardingStep plan={IOS_PLAN} onSkip={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'App Store' })).toHaveAttribute(
      'href',
      IOS_PLAN.store.url,
    );
    expect(screen.queryByRole('button', { name: /home screen/i })).not.toBeInTheDocument();
  });

  it('offers Play plus the home screen on Android', () => {
    render(<AppInstallOnboardingStep plan={ANDROID_PLAN} onSkip={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /home screen/i })).toBeInTheDocument();
  });

  // Nobody may be stranded on the first screen of onboarding.
  it('is skippable', () => {
    const onSkip = vi.fn();
    render(<AppInstallOnboardingStep plan={IOS_PLAN} onSkip={onSkip} />);

    screen.getByRole('button', { name: /Continue in the browser/i }).click();

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  // The store opens in its own tab, so the step must not be waiting here when
  // the visitor comes back.
  it('marks itself answered when the store link is taken', () => {
    const onSkip = vi.fn();
    render(<AppInstallOnboardingStep plan={ANDROID_PLAN} onSkip={onSkip} />);

    screen.getByRole('link', { name: 'Google Play' }).click();

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
