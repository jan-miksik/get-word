import { beforeEach, describe, expect, it } from 'vitest';
import {
  onboardingStepEnterClass,
  resetOnboardingStepTracking,
  trackOnboardingStep,
} from '../stepTransition';

describe('trackOnboardingStep', () => {
  beforeEach(() => {
    resetOnboardingStepTracking();
  });

  it('fades the first step in rather than sliding it from nowhere', () => {
    expect(trackOnboardingStep('language')).toBe('none');
  });

  it('reports the direction the flow moved in', () => {
    trackOnboardingStep('language');
    expect(trackOnboardingStep('level')).toBe('forward');
    expect(trackOnboardingStep('goal')).toBe('forward');
    expect(trackOnboardingStep('level')).toBe('back');
  });

  it('answers the same for a repeated question about the same step', () => {
    trackOnboardingStep('goal');
    expect(trackOnboardingStep('reminder')).toBe('forward');
    // A double render must not turn the move that just happened into no move.
    expect(trackOnboardingStep('reminder')).toBe('forward');
  });

  it('skips the slide for a screen that is not on the rail', () => {
    trackOnboardingStep('level');
    expect(trackOnboardingStep(null)).toBe('none');
  });

  it('names a class for every direction', () => {
    expect(onboardingStepEnterClass('forward')).toBe('onboarding-step-enter-forward');
    expect(onboardingStepEnterClass('back')).toBe('onboarding-step-enter-back');
    expect(onboardingStepEnterClass('none')).toBe('onboarding-step-enter-plain');
  });
});
