'use client';

import type { NormalizedWord } from '@/lib/words';
import type { WordSide } from '@/features/learning/state/learningRole';

export type PromptMode = 'text' | 'audio';

// Re-export pair-agnostic learning types/helpers so call sites can import the new API
// from this module (which is where they already import the old types from).
export type { LearningRole, WordSide } from '@/features/learning/state/learningRole';
export {
  flipSide,
  knownSideForRole,
  learningSideForRole,
} from '@/features/learning/state/learningRole';

/**
 * Read the text of a word on a given side.
 *
 * Words still have the legacy `cz` / `vi` field shape: `wordListItemsToNormalizedWords`
 * maps `textKnown → cz` and `textTarget → vi`. The side→field mapping is:
 *   'from' → word.cz  (= textKnown, the list's languageFrom side)
 *   'to'   → word.vi  (= textTarget, the list's languageTo side)
 *
 * Migrating the underlying field shape away from cz/vi is a separate task.
 */
export function getWordTextBySide(word: NormalizedWord, side: WordSide): string {
  return side === 'from' ? word.cz : word.vi;
}

export function getWordAcceptedAnswersBySide(
  word: NormalizedWord,
  side: WordSide,
): string[] {
  return side === 'from' ? word.acceptedKnown ?? [] : word.acceptedTarget ?? [];
}

export function normalizeAudioPath(path: string): string {
  const pathStr = path.trim();
  if (/^(https?:)?\/\//i.test(pathStr) || /^(data|blob):/i.test(pathStr)) {
    return pathStr;
  }
  return pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
}

export function getWordAudioSrcBySide(
  word: NormalizedWord,
  side: WordSide,
): string | null {
  return getWordAudioSrcsBySide(word, side)[0] ?? null;
}

export function getWordAudioSrcsBySide(
  word: NormalizedWord,
  side: WordSide,
): string[] {
  const raw = side === 'from' ? word.czAudio : word.viAudio;
  if (!raw) return [];
  const candidates = Array.isArray(raw) ? raw : [raw];
  return candidates
    .filter(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0,
    )
    .map(normalizeAudioPath)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index);
}

/**
 * Look up the BCP-47 language code for a word's given side. Set by
 * wordListItemsToNormalizedWords from the list's languageFrom / languageTo.
 * Returns null when the word has no language metadata (legacy bundled data).
 */
export function getWordLanguageCodeForSide(
  word: NormalizedWord,
  side: WordSide,
): string | null {
  const code = side === 'from' ? word.languageFrom : word.languageTo;
  if (!code) return null;
  const trimmed = String(code).trim();
  return trimmed ? trimmed : null;
}
