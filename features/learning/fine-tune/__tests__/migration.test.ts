import { describe, it, expect, beforeEach } from 'vitest';
import { LEARNING_LOCAL_PREFERENCE_KEYS } from '@/features/learning/state/localPreferences';
import { migrateLegacyTypingMode } from '../migration';
import { activeMethods, presetConfig } from '../config';

const MIGRATED_KEY = 'get-word-fine-tune-migrated';

beforeEach(() => {
  window.localStorage.clear();
});

describe('migrateLegacyTypingMode', () => {
  it('turns the old global typing mode into typing from the one-day stage up', () => {
    window.localStorage.setItem(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode, 'true');

    const migrated = migrateLegacyTypingMode(false);
    expect(migrated).not.toBeNull();

    // Nothing new at "now" and "5 minutes" — typing a word you met a moment ago
    // is not what the old setting was for.
    expect(activeMethods(migrated!.stages[0])).not.toContain('typing');
    expect(activeMethods(migrated!.stages[1])).not.toContain('typing');
    for (let stage = 2; stage < migrated!.stages.length; stage += 1) {
      expect(activeMethods(migrated!.stages[stage])).toContain('typing');
    }
  });

  it('leaves the stages the balanced preset already types on untouched', () => {
    window.localStorage.setItem(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode, 'true');
    const balanced = presetConfig('balanced');
    const migrated = migrateLegacyTypingMode(false)!;
    expect(migrated.stages[5].typing.variants).toEqual(balanced.stages[5].typing.variants);
    expect(migrated.stages[7].typing.variants).toEqual(balanced.stages[7].typing.variants);
  });

  it('does nothing for a learner who never enabled typing mode', () => {
    expect(migrateLegacyTypingMode(false)).toBeNull();
  });

  it('does nothing when the account already carries a config', () => {
    window.localStorage.setItem(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode, 'true');
    expect(migrateLegacyTypingMode(true)).toBeNull();
    // …and it stays available until it is actually needed.
    expect(window.localStorage.getItem(MIGRATED_KEY)).toBeNull();
  });

  it('runs only once', () => {
    window.localStorage.setItem(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode, 'true');
    expect(migrateLegacyTypingMode(false)).not.toBeNull();
    expect(migrateLegacyTypingMode(false)).toBeNull();
  });
});
