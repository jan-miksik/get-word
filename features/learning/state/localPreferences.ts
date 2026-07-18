export type RevealMode = 'press' | 'scratch';
export type TypingWriteIn = 'foreign' | 'both' | 'known';

export const LEARNING_LOCAL_PREFERENCE_KEYS = {
  progressiveReveal: 'get-word-progressive-reveal-enabled',
  revealMode: 'get-word-reveal-mode',
  swipeCards: 'get-word-swipe-cards-enabled',
  tiltGame: 'get-word-tilt-game-enabled',
  typingMode: 'get-word-typing-mode-enabled',
  typingWriteIn: 'get-word-typing-write-in',
  typingAudioPrompt: 'get-word-typing-audio-prompt-enabled',
  typingPrefillPunctuation: 'get-word-typing-prefill-punctuation',
  typingMobileKeyboardAutoFocus: 'get-word-typing-mobile-keyboard-autofocus',
  typingPlayAudioAfterCheck: 'get-word-typing-play-audio-after-check',
  typingCheckButton: 'get-word-typing-check-button-enabled',
} as const;

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storeLearningLocalPreference(key: string, value: string | boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Keep the in-memory setting usable when storage is unavailable.
  }
}

export const readProgressiveRevealPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.progressiveReveal) !== 'false';

export const readSwipeCardsPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.swipeCards) === 'true';

export const readTiltGamePreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.tiltGame) === 'true';

export const readRevealModePreference = (): RevealMode =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.revealMode) === 'press' ? 'press' : 'scratch';

export const readTypingModePreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode) === 'true';

export function readTypingWriteInPreference(): TypingWriteIn {
  const stored = readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingWriteIn);
  return stored === 'both' || stored === 'known' ? stored : 'foreign';
}

export const readTypingAudioPromptPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingAudioPrompt) === 'true';

export const readTypingPrefillPunctuationPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingPrefillPunctuation) === 'true';

export const readTypingMobileKeyboardAutoFocusPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingMobileKeyboardAutoFocus) === 'true';

export const readTypingPlayAudioAfterCheckPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingPlayAudioAfterCheck) === 'true';

export const readTypingCheckButtonPreference = () =>
  readStorage(LEARNING_LOCAL_PREFERENCE_KEYS.typingCheckButton) === 'true';
