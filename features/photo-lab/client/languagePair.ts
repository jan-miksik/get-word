// Compatibility entrypoint for older Photo Lab imports. The preference is now
// shared with chat and onboarding.
export {
  readLearningLanguagePair as readPhotoLabLanguagePair,
  storeLearningLanguagePair as storePhotoLabLanguagePair,
} from '@/features/shared/languages/learningPairStorage';
