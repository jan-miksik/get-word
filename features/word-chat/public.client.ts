/**
 * The word-chat generation pipeline, for other features that need to create
 * study items without walking the learner through the whole conversation.
 *
 * Deliberately just the transport calls: the chat's own state machine,
 * storage and screens stay internal, and the response types are inferred at the
 * call site rather than re-exported.
 *
 * The language level is also here rather than inside the chat: it is a property
 * of the learner and their target language, asked once during onboarding, and
 * the chat is only one of its readers.
 */
export {
  requestSimilarWords,
  commitSession,
} from './client/api';

export { fetchWordChatContext, saveWordChatPreferences } from './client/api';
export { WORD_CHAT_LANGUAGE_LEVELS } from './preferences';
export { wordChatLevelLabelKey, splitWordChatLevelLabel } from './levelLabels';
export type { WordChatLanguageLevel } from './types';

/** Keeps the full add-words workspace out of consumers' initial bundles. */
export async function loadAddWordsScreen() {
  return import('./components/AddWordsScreen').then((module) => module.AddWordsScreen);
}
