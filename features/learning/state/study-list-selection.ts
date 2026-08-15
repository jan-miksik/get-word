import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type StudyListChoice = {
  id: string;
  languageFrom: string;
  languageTo: string;
  isRecommended?: boolean;
  isOwnedPersonal?: boolean;
};

/**
 * Resolve the words that may appear on the study surface.
 *
 * No active list is a real state after switching to a language pair for which
 * the learner has not created a list yet. It must stay empty: falling back to
 * the complete synced collection would mix unrelated language pairs.
 */
export function resolveActiveStudyWords<T>(
  activeList: StudyListChoice | null,
  hasPersonalWordsForActivePair: boolean,
  filteredSyncedWords: T[] | null,
  fallbackWords: T[],
): T[] {
  if (!activeList || !hasPersonalWordsForActivePair) return [];
  return filteredSyncedWords ?? fallbackWords;
}

/**
 * Pick the list that acts as the base layer for a language pair.
 *
 * Personal words are overlaid automatically when a non-personal list exists,
 * so the non-personal list remains the base selection in that case. If it does
 * not exist, the personal list becomes the only active layer.
 */
export function chooseBaseStudyListForPair(
  lists: readonly StudyListChoice[],
  currentListId: string | null | undefined,
  languageFrom: string,
  languageTo: string,
): string | null {
  const from = normalizeLanguageCode(languageFrom);
  const to = normalizeLanguageCode(languageTo);
  const matching = lists.filter(
    (list) =>
      normalizeLanguageCode(list.languageFrom) === from &&
      normalizeLanguageCode(list.languageTo) === to,
  );
  if (matching.length === 0) return null;

  const nonPersonal = matching.filter((list) => !list.isOwnedPersonal);
  if (nonPersonal.length > 0) {
    const current = lists.find((list) => list.id === currentListId);
    const preferredRecommendation = current?.isRecommended === true;
    return (
      nonPersonal.find((list) => list.isRecommended === preferredRecommendation)?.id ??
      nonPersonal.find((list) => list.isRecommended === true)?.id ??
      nonPersonal[0].id
    );
  }

  return matching.find((list) => list.isOwnedPersonal)?.id ?? matching[0].id;
}
