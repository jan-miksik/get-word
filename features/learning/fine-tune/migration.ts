import { LEARNING_LOCAL_PREFERENCE_KEYS } from '@/features/learning/state/localPreferences';
import { presetConfig } from './config';
import type { FineTuneConfig } from './types';

const MIGRATED_KEY = 'get-word-fine-tune-migrated';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function markMigrated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, 'true');
  } catch {
    // A storage failure only means we may offer the migration again later,
    // which is harmless: it never runs once the server holds a config.
  }
}

/**
 * Carry a learner who had the old all-or-nothing typing mode switched on into
 * the per-stage model.
 *
 * They chose to type everything, so dropping them onto the plain default would
 * quietly take that away. Instead they get the balanced ladder with typing
 * already active from the five-minute stage up. That first writing card is
 * heavily scaffolded; later stages progressively remove the help.
 *
 * Returns null when there is nothing to migrate: no legacy flag, already
 * migrated, or the account already carries a config from another device.
 */
export function migrateLegacyTypingMode(hasServerConfig: boolean): FineTuneConfig | null {
  if (hasServerConfig) return null;
  if (readStorage(MIGRATED_KEY) === 'true') return null;

  const hadTypingMode = readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode) === 'true';
  markMigrated();
  if (!hadTypingMode) return null;

  return presetConfig('balanced');
}
