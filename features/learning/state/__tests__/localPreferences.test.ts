import { beforeEach, describe, expect, it } from 'vitest';
import {
  LEARNING_LOCAL_PREFERENCE_KEYS,
  readQuickAddPreference,
} from '../localPreferences';

describe('quick-add local preference', () => {
  beforeEach(() => {
    localStorage.removeItem(LEARNING_LOCAL_PREFERENCE_KEYS.quickAdd);
  });

  it('defaults to enabled when no choice has been stored', () => {
    expect(readQuickAddPreference()).toBe(true);
  });

  it('stays enabled even when an old disabled choice is stored', () => {
    localStorage.setItem(LEARNING_LOCAL_PREFERENCE_KEYS.quickAdd, 'false');
    expect(readQuickAddPreference()).toBe(true);
    localStorage.setItem(LEARNING_LOCAL_PREFERENCE_KEYS.quickAdd, 'true');
    expect(readQuickAddPreference()).toBe(true);
  });
});
