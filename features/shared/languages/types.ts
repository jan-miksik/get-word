export type SupportedLearningLanguage = {
  code: string;
  name: string;
  flag?: string;
  ttsAvailable?: boolean;
  preferredVoice?: string | null;
};

/** Compatibility name for feature props while the shared layer becomes canonical. */
export type LearningLanguage = SupportedLearningLanguage;
