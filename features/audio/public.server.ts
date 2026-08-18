/**
 * Server-side surface of the audio feature for other features to build on.
 *
 * Generation is exposed because the quality pool needs to record a clip for a
 * (text, language) pair without owning a word-list item — `linkToItem: false`
 * on the context. Everything about voices, autofix fallbacks, storage and
 * quota stays inside the feature.
 */

export { generateAudioForItem } from './server/batch/generate-item';
