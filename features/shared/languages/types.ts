export type SupportedLearningLanguage = {
  code: string;
  name: string;
  flag?: string;
  /**
   * Code used only to label the language when the stored code is ambiguous:
   * "en" is British English, so it is labelled through "en-GB". Identity always
   * stays `code`.
   */
  displayCode?: string;
  ttsAvailable?: boolean;
  preferredVoice?: string | null;
};

/** Compatibility name for feature props while the shared layer becomes canonical. */
export type LearningLanguage = SupportedLearningLanguage;
