import { describe, expect, it } from 'vitest';
import { hasConfiguredGoal, resolveLearningOnboardingStep } from '../flow';

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
