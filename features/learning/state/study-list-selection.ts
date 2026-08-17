import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type StudyListChoice = {
  id: string;
  languageFrom: string;
  languageTo: string;
  isRecommended?: boolean;
  isOwnedPersonal?: boolean;
};

/**
 * True for a list the learner never chose: the app's own curated catalogue,
 * which a language pair falls back to on its own. `isRecommended` is the only
 * such marker the sync payload carries, and it is exactly the one that means
 * "we picked this, not you".
 *
 * A list reached through `/join`, a school assignment, or a public list the
 * learner subscribed to deliberately is not this — someone chose it, and
 * emptying it out from under them would be a regression rather than a nudge.
 */
export function isDefaultCatalogueList(list: StudyListChoice): boolean {
  return list.isRecommended === true;
}

/**
 * Resolve the words that may appear on the study surface.
 *
 * No active list is a real state after switching to a language pair for which
 * the learner has not created a list yet. It must stay empty: falling back to
 * the complete synced collection would mix unrelated language pairs.
 *
 * The default catalogue is a compatibility layer only, so it also stays empty
 * until the learner has a personal word for the pair — that is what points them
 * at Add words instead of silently starting a catalogue they never asked for.
 * Any list they did choose studies regardless.
 */
export function resolveActiveStudyWords<T>(
  activeList: StudyListChoice | null,
  hasPersonalWordsForActivePair: boolean,
  filteredSyncedWords: T[] | null,
  fallbackWords: T[],
): T[] {
  if (!activeList) return [];
  if (isStudyGated(activeList, hasPersonalWordsForActivePair)) return [];
  return filteredSyncedWords ?? fallbackWords;
}

/** True when the study surface is deliberately held empty for this pair. */
export function isStudyGated(
  activeList: StudyListChoice | null,
  hasPersonalWordsForActivePair: boolean,
): boolean {
  if (!activeList) return false;
  return isDefaultCatalogueList(activeList) && !hasPersonalWordsForActivePair;
}

/**
 * True when this language pair has nothing to study — as opposed to a deck the
 * learner has emptied, which is the "All done" case.
 *
 * Switching to a pair the learner has no list for leaves `activeList` null; a
 * list that exists can still hold no items; and the default catalogue stays
 * gated until a personal word exists. All three end on a blank surface that
 * must offer a way to add words instead of congratulating the learner for
 * finishing a pair they never started.
 */
export function isStudyEmptyForPair(
  activeList: StudyListChoice | null,
  hasPersonalWordsForActivePair: boolean,
  activeWordCount: number,
): boolean {
  return (
    activeWordCount === 0 || isStudyGated(activeList, hasPersonalWordsForActivePair)
  );
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
