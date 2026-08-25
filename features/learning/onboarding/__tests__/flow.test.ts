import { describe, expect, it } from 'vitest';
import {
  applyOnboardingBack,
  hasConfiguredGoal,
  onboardingBackTarget,
  resolveLearningOnboardingStep,
} from '../flow';

const complete = {
  forceLanguage: false,
  hasNoSelectedWordList: false,
  onboardingCompleted: true,
  hasLanguagePair: true,
  languageLevelLoaded: true,
  hasLanguageLevel: true,
  goalSummaryLoaded: true,
  hasConfiguredGoal: true,
  reminderOnboardingAnswered: true,
};

/** Someone who saved their languages and has nothing else answered yet. */
const settingUp = {
  ...complete,
  hasNoSelectedWordList: true,
  hasLanguageLevel: false,
  hasConfiguredGoal: false,
  reminderOnboardingAnswered: false,
};

describe('resolveLearningOnboardingStep', () => {
  it('starts a new learner with languages', () => {
    expect(resolveLearningOnboardingStep({
      ...settingUp,
      onboardingCompleted: false,
      hasLanguagePair: false,
    })).toBe('language');
  });

  it('asks for the level once the languages are saved', () => {
    expect(resolveLearningOnboardingStep(settingUp)).toBe('level');
  });

  it('waits rather than guessing while the stored level is still loading', () => {
    expect(resolveLearningOnboardingStep({
      ...settingUp,
      languageLevelLoaded: false,
    })).toBe('loading');
  });

  it('walks level, goal, reminder, and first words in that order', () => {
    const afterLevel = { ...settingUp, hasLanguageLevel: true };
    expect(resolveLearningOnboardingStep(afterLevel)).toBe('goal');

    const afterGoal = { ...afterLevel, hasConfiguredGoal: true };
    expect(resolveLearningOnboardingStep(afterGoal)).toBe('reminder');

    const afterReminder = { ...afterGoal, reminderOnboardingAnswered: true };
    expect(resolveLearningOnboardingStep(afterReminder)).toBe('words');
  });

  it('sends a returning learner without a goal directly to the goal', () => {
    expect(resolveLearningOnboardingStep({
      ...complete,
      hasConfiguredGoal: false,
      reminderOnboardingAnswered: false,
    })).toBe('goal');
  });

  it('never asks an established learner for their level', () => {
    expect(resolveLearningOnboardingStep({
      ...complete,
      hasLanguageLevel: false,
      hasConfiguredGoal: false,
    })).toBe('goal');
  });

  it('resumes after goal save at the reminder choice', () => {
    expect(resolveLearningOnboardingStep({
      ...complete,
      reminderOnboardingAnswered: false,
    })).toBe('reminder');
  });

  it('does not interrupt an existing learner with a completed reminder choice', () => {
    expect(resolveLearningOnboardingStep(complete)).toBe('app');
  });
});

describe('hasConfiguredGoal', () => {
  const version = { enabled: true };

  it('is false for a learner who has never been asked', () => {
    expect(hasConfiguredGoal({ active: null, pending: null })).toBe(false);
    expect(hasConfiguredGoal(null)).toBe(false);
    expect(hasConfiguredGoal(undefined)).toBe(false);
  });

  // The whole point of the predicate: a goal switched off in Settings is a
  // stored version that is not enabled, and the learner must stay in the app.
  it('is true for a goal that is stored but switched off', () => {
    expect(hasConfiguredGoal({ active: { enabled: false }, pending: null })).toBe(true);
    expect(hasConfiguredGoal({ active: null, pending: { enabled: false } })).toBe(true);
  });

  it('is true for a goal that is running', () => {
    expect(hasConfiguredGoal({ active: version, pending: null })).toBe(true);
  });
});

describe('onboardingBackTarget', () => {
  const settingUpRun = { isSettingUp: true };

  it('has nothing before the languages', () => {
    expect(onboardingBackTarget('language', settingUpRun)).toBeNull();
  });

  it('walks the setup run back one step at a time', () => {
    expect(onboardingBackTarget('level', settingUpRun)).toBe('language');
    expect(onboardingBackTarget('goal', settingUpRun)).toBe('level');
    expect(onboardingBackTarget('reminder', settingUpRun)).toBe('goal');
    expect(onboardingBackTarget('words', settingUpRun)).toBe('reminder');
  });

  // The level question belongs to first-time setup. Offering it as "back" to
  // someone who is only being asked for a goal would show them a screen they
  // never saw on the way in.
  it('stops at the goal for a learner who is not being set up', () => {
    expect(onboardingBackTarget('goal', { isSettingUp: false })).toBeNull();
    expect(onboardingBackTarget('reminder', { isSettingUp: false })).toBe('goal');
  });

  it('has no back out of the app itself', () => {
    expect(onboardingBackTarget('app', settingUpRun)).toBeNull();
    expect(onboardingBackTarget('loading', settingUpRun)).toBeNull();
  });
});

describe('applyOnboardingBack', () => {
  it('shows the step Back asked for', () => {
    expect(applyOnboardingBack('reminder', 'goal')).toBe('goal');
    expect(applyOnboardingBack('words', 'level')).toBe('level');
  });

  it('leaves the flow alone when nobody pressed Back', () => {
    expect(applyOnboardingBack('reminder', null)).toBe('reminder');
  });

  // Back only ever moves backwards. A stale override pointing at a step the
  // stored answers have already passed must not pull the learner forward — or,
  // worse, hold them on a step they have just finished.
  it('never moves the flow forward', () => {
    expect(applyOnboardingBack('level', 'words')).toBe('level');
    expect(applyOnboardingBack('goal', 'goal')).toBe('goal');
  });

  it('waits rather than jumping while answers are still loading', () => {
    expect(applyOnboardingBack('loading', 'language')).toBe('loading');
  });

  it('does not pull a finished learner back into setup', () => {
    expect(applyOnboardingBack('app', 'goal')).toBe('app');
  });
});
