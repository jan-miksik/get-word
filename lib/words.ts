// Word normalization and utility functions

import { normalizeWordItemComment, type WordItemComment } from '@/lib/word-item-comment';
import {
  normalizeWordItemAddressForm,
  oppositeAddressForm,
  type AddressFormValue,
} from '@/lib/word-item-address-form';
import { normalizeAcceptedAnswersForDisplay } from '@/lib/word-item-accepted-answers';

export interface Word {
  id: string;
  category: string[];
  cz: string;
  en: string;
  vi: string;
  czPron?: string;
  viPron?: string;
  czAudio?: string | string[];
  viAudio?: string | string[];
  czHint?: string;
  viHint?: string;
}

export interface NormalizedWord extends Word {
  id: string;
  category: string[];
  categoryPositions?: Record<string, number>;
  /**
   * Stable category id. Used for study priority — ids, not names, because names
   * are editable, repeat across lists, and differ per language.
   */
  categoryId?: string | null;
  /** Namespaced filter identity; never use the display name as identity. */
  categoryKey?: string | null;
  categorySourceName?: string;
  listPosition?: number;
  listId?: string;
  canonicalWordId?: string | null;
  languageFrom?: string;
  languageTo?: string;
  acceptedKnown?: string[];
  acceptedTarget?: string[];
  comment?: WordItemComment | null;
  /**
   * Form of address plus, when the twin is present, its wording. `counterpart`
   * is derived here rather than stored: keeping a copy of the sibling's text in
   * the database would go stale the moment either row is edited, the twin is
   * deleted, or the list is forked.
   */
  addressForm?: { form: AddressFormValue; counterpart?: string } | null;
}

/**
 * Attach the runtime address form: the stored `{ form }` plus the sibling's
 * target text when the pair is still intact. A group whose twin was deleted (or
 * simply is not in this list) yields a form with no counterpart — the form is
 * true of the row on its own.
 */
function resolveAddressForm(
  item: { id: string; textKnown: string | null; textTarget: string | null; addressForm?: unknown },
  itemsByGroup: Map<string, AddressFormGroupEntry[]>,
): { form: AddressFormValue; counterpart?: string } | null {
  const stored = normalizeWordItemAddressForm(item.addressForm);
  if (!stored) return null;
  if (!stored.groupId) return { form: stored.form };

  const members = itemsByGroup.get(stored.groupId);
  if (members?.length !== 2) return { form: stored.form };
  const [first, second] = members;
  if (normalizeAddressPairText(first.textKnown) !== normalizeAddressPairText(second.textKnown)) {
    return { form: stored.form };
  }
  if (normalizeAddressPairText(first.textTarget) === normalizeAddressPairText(second.textTarget)) {
    return { form: stored.form };
  }
  if (second.form !== oppositeAddressForm(first.form)) return { form: stored.form };

  const sibling = members.find((entry) => entry.id !== item.id);

  return sibling ? { form: stored.form, counterpart: sibling.textTarget } : { form: stored.form };
}

type AddressFormGroupEntry = {
  id: string;
  textKnown: string;
  textTarget: string;
  form: AddressFormValue;
};

function normalizeAddressPairText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Audio used to ship as static files under public/speech/. The app now serves
// audio from Arweave (and /api/audio), so these legacy local paths are dropped:
// most of them have no matching file, producing 404 noise during bulk caching
// and playback. Keeping only remote/api audio lets public/speech be removed.
export function stripLegacyLocalSpeechAudio(
  value: string | string[] | undefined | null,
): string | string[] | undefined {
  const isLegacy = (url: unknown): boolean =>
    typeof url === 'string' && /^\/?speech\//i.test(url.trim());
  if (Array.isArray(value)) {
    const kept = value.filter(
      (url): url is string => typeof url === 'string' && url.length > 0 && !isLegacy(url),
    );
    return kept.length > 0 ? kept : undefined;
  }
  return typeof value === 'string' && value.length > 0 && !isLegacy(value)
    ? value
    : undefined;
}

export function stripLegacyLocalSpeechAudioFromWord<T extends Pick<Word, 'czAudio' | 'viAudio'>>(
  word: T,
): T {
  return {
    ...word,
    czAudio: stripLegacyLocalSpeechAudio(word.czAudio),
    viAudio: stripLegacyLocalSpeechAudio(word.viAudio),
  };
}

// Spaced-repetition stages
export const STAGES = [
  { id: 0, name: "New / forgotten", intervalMs: 0 },
  { id: 1, name: "5 minutes", intervalMs: 5 * 60 * 1000 },
  { id: 2, name: "1 day", intervalMs: 24 * 60 * 60 * 1000 },
  { id: 3, name: "3 days", intervalMs: 3 * 24 * 60 * 60 * 1000 },
  { id: 4, name: "7 days", intervalMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 5, name: "14 days", intervalMs: 14 * 24 * 60 * 60 * 1000 },
  { id: 6, name: "30 days", intervalMs: 30 * 24 * 60 * 60 * 1000 },
  { id: 7, name: "60 days", intervalMs: 60 * 24 * 60 * 60 * 1000 },
];

export const MEMORY_HOOK_DISABLE_STAGE_OPTIONS = [2, 3, 4, 5, 6, 7] as const;
export type MemoryHookDisableFromStage = (typeof MEMORY_HOOK_DISABLE_STAGE_OPTIONS)[number];
export const DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE: MemoryHookDisableFromStage = 5; // 14 days

export function normalizeMemoryHookDisableFromStage(
  value: unknown
): MemoryHookDisableFromStage {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE;
  const normalized = Math.floor(parsed) as MemoryHookDisableFromStage;
  return MEMORY_HOOK_DISABLE_STAGE_OPTIONS.includes(normalized)
    ? normalized
    : DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE;
}

export function shouldShowMemoryHookForStage(
  stageIndex: number,
  memoryHooksEnabled: boolean,
  memoryHookDisableFromStage: number
): boolean {
  if (!memoryHooksEnabled) return false;
  const normalizedStage = Number.isFinite(stageIndex) ? Math.max(0, Math.floor(stageIndex)) : 0;
  const cutoff = normalizeMemoryHookDisableFromStage(memoryHookDisableFromStage);
  return normalizedStage < cutoff;
}

// Study-note (comment) minimization: once a card reaches this stage the note
// collapses to a chip by default (doubling as the spoiler control).
export const STUDY_NOTE_MINIMIZE_STAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
export type StudyNoteMinimizeFromStage =
  (typeof STUDY_NOTE_MINIMIZE_STAGE_OPTIONS)[number];
export const DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE: StudyNoteMinimizeFromStage = 2; // 1 day

export function normalizeStudyNoteMinimizeFromStage(
  value: unknown
): StudyNoteMinimizeFromStage {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE;
  const normalized = Math.floor(parsed) as StudyNoteMinimizeFromStage;
  return STUDY_NOTE_MINIMIZE_STAGE_OPTIONS.includes(normalized)
    ? normalized
    : DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE;
}

/** Whether a comment should render minimized (collapsed to a chip) by default. */
export function shouldMinimizeStudyNoteForStage(
  stageIndex: number,
  studyNoteMinimizeFromStage: number
): boolean {
  const normalizedStage = Number.isFinite(stageIndex) ? Math.max(0, Math.floor(stageIndex)) : 0;
  const cutoff = normalizeStudyNoteMinimizeFromStage(studyNoteMinimizeFromStage);
  return normalizedStage >= cutoff;
}

export function getAvailableCategories(
  words: NormalizedWord[]
): Array<{ key: string; name: string; sourceName?: string; count: number; position?: number }> {
  const counts = new Map<string, number>();
  const positions = new Map<string, number>();
  const labels = new Map<string, { name: string; sourceName?: string }>();
  words.forEach((word) => {
    word.category.forEach((cat) => {
      if (cat === "word" || cat === "phrase") return;
      const key = word.categoryKey ?? cat;
      counts.set(key, (counts.get(key) || 0) + 1);
      labels.set(key, { name: cat, sourceName: word.categorySourceName });
      const position = word.categoryPositions?.[cat];
      if (typeof position === 'number' && Number.isFinite(position)) {
        const current = positions.get(key);
        positions.set(key, current === undefined ? position : Math.min(current, position));
      }
    });
  });
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      name: labels.get(key)?.name ?? key,
      sourceName: labels.get(key)?.sourceName,
      count,
      position: positions.get(key),
    }))
    .sort((a, b) => {
      const aPosition = a.position;
      const bPosition = b.position;
      if (aPosition !== undefined && bPosition !== undefined && aPosition !== bPosition) {
        return aPosition - bPosition;
      }
      if (aPosition !== undefined && bPosition === undefined) return -1;
      if (aPosition === undefined && bPosition !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
}

function getFilterableWordCategories(word: NormalizedWord): string[] {
  return word.category.filter((cat) => cat !== "word" && cat !== "phrase");
}

type CategorySortKey = {
  source: number;
  value: number | string;
};

function getWordCategorySortKey(
  word: NormalizedWord,
  categoryOrderIndex: Map<string, number>
): CategorySortKey {
  const categories = getFilterableWordCategories(word);
  if (categories.length === 0) return { source: 3, value: "" };

  let best: CategorySortKey | null = null;
  for (const category of categories) {
    const userIndex =
      categoryOrderIndex.get(word.categoryKey ?? category) ??
      categoryOrderIndex.get(category);
    const key =
      userIndex !== undefined
        ? { source: 0, value: userIndex }
        : typeof word.categoryPositions?.[category] === "number" &&
            Number.isFinite(word.categoryPositions[category])
          ? { source: 1, value: word.categoryPositions[category] }
          : { source: 2, value: category };

    if (!best || compareCategorySortKeys(key, best) < 0) {
      best = key;
    }
  }

  return best ?? { source: 3, value: "" };
}

function compareCategorySortKeys(left: CategorySortKey, right: CategorySortKey): number {
  if (left.source !== right.source) return left.source - right.source;
  if (typeof left.value === "number" && typeof right.value === "number") {
    return left.value - right.value;
  }
  return String(left.value).localeCompare(String(right.value));
}

export function createWordCategoryOrderComparer(categoryOrder: string[] = []) {
  const categoryOrderIndex = new Map<string, number>();
  categoryOrder.forEach((name, index) => categoryOrderIndex.set(name, index));

  return (left: NormalizedWord, right: NormalizedWord): number => {
    const categoryComparison = compareCategorySortKeys(
      getWordCategorySortKey(left, categoryOrderIndex),
      getWordCategorySortKey(right, categoryOrderIndex)
    );
    if (categoryComparison !== 0) return categoryComparison;

    const leftPosition = left.listPosition;
    const rightPosition = right.listPosition;
    if (leftPosition !== undefined && rightPosition !== undefined && leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }
    if (leftPosition !== undefined) return -1;
    if (rightPosition !== undefined) return 1;
    return 0;
  };
}

/**
 * The single place that decides study priority.
 *
 * Words the learner created for themselves through the word chat lead the
 * stream — ahead even of due repeats — because someone who just talked about
 * their café job expects to practise those words now, not in three days. That
 * is a deliberate product bet against textbook spaced repetition, and it is
 * kept in one function so it can be measured and changed in one place.
 *
 * The likely successor is a decaying `priorityScore` (high on creation, fading
 * over a week or two) rather than a permanent boolean pin. Replacing the
 * predicate below is all that would take.
 */
export function createPriorityPredicate(
  pinnedCategoryIds: readonly string[] = [],
  ownedPersonalListIds: ReadonlySet<string> = new Set(),
) {
  const pinned = new Set(pinnedCategoryIds);
  if (pinned.size === 0 && ownedPersonalListIds.size === 0) return () => false;
  return (word: NormalizedWord): boolean =>
    Boolean(
      (word.listId && ownedPersonalListIds.has(word.listId)) ||
        (word.categoryId && pinned.has(word.categoryId)),
    );
}

export function matchesCategoryFilter(word: NormalizedWord, selectedCategories: Set<string>): boolean {
  const filterableCategories = word.category.filter((cat) => cat !== "word" && cat !== "phrase");
  if (filterableCategories.length === 0) {
    return selectedCategories.size === 0;
  }
  if (!selectedCategories.size) return false;
  if (word.categoryKey) return selectedCategories.has(word.categoryKey);
  return filterableCategories.some((cat) => selectedCategories.has(cat));
}

export function isDue(progress: { stageIndex: number; nextDueAt?: number }): boolean {
  if (!progress || progress.stageIndex === 0) return false;
  if (!progress.nextDueAt) return false;
  return Date.now() >= progress.nextDueAt;
}

/**
 * Convert word_list_items (from sync API) into NormalizedWord[].
 * Maps the new schema to the existing NormalizedWord shape so the rest of
 * the app (WordCard, minigames, useWordStream) works unchanged.
 */
export function wordListItemsToNormalizedWords(
  items: Array<{
    id: string;
    listId?: string;
    canonicalWordId?: string | null;
    categoryId: string | null;
    textKnown: string;
    textTarget: string | null;
    acceptedKnown?: string[];
    acceptedTarget?: string[];
    knownAudioUrl?: string | null;
    knownAudioArweaveUrl?: string | null;
    knownAudioArweaveUrls?: string[];
    audioUrl?: string | null;
    audioArweaveUrl?: string | null;
    audioArweaveUrls?: string[];
    languageFrom?: string;
    languageTo?: string;
    notes: string | null;
    comment?: unknown;
    addressForm?: unknown;
    position: number;
    ignoreCase?: boolean;
  }>,
  categories: Record<string, { name: string; position: number }>,
  opts?: {
    mediaFallbackWords?: Array<
      Pick<NormalizedWord, 'cz' | 'vi' | 'czPron' | 'viPron' | 'czAudio' | 'viAudio'>
    >;
    listNamesById?: Record<string, string>;
  },
): NormalizedWord[] {
  const normalizePairKeyPart = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();

  const pairKey = (left: string, right: string) =>
    `${normalizePairKeyPart(left)}|${normalizePairKeyPart(right)}`;
  const normalizeListCode = (value: string | undefined) => {
    const [base] = String(value ?? '').trim().split('-');
    const normalized = base.toLowerCase();
    return normalized === 'cz' ? 'cs' : normalized;
  };

  const mediaByPair = new Map<
    string,
    Pick<NormalizedWord, 'czPron' | 'viPron' | 'czAudio' | 'viAudio'>
  >();
  for (const word of opts?.mediaFallbackWords ?? []) {
    mediaByPair.set(pairKey(word.cz, word.vi), {
      czPron: word.czPron,
      viPron: word.viPron,
      czAudio: word.czAudio,
      viAudio: word.viAudio,
    });
  }

  // The two rows of an address-form pair share a groupId, and each needs the
  // OTHER one's target text — `sibling.textTarget`, never `textKnown`, which is
  // identical on both and would render the card's own prompt back at it.
  const addressItemsByGroup = new Map<string, AddressFormGroupEntry[]>();
  for (const item of items) {
    const stored = normalizeWordItemAddressForm(item.addressForm);
    if (!stored?.groupId || !item.textKnown || !item.textTarget) continue;
    const group = addressItemsByGroup.get(stored.groupId);
    const entry = {
      id: item.id,
      textKnown: item.textKnown,
      textTarget: item.textTarget,
      form: stored.form,
    };
    if (group) group.push(entry);
    else addressItemsByGroup.set(stored.groupId, [entry]);
  }

  return items
    .filter((item) => item.textKnown && item.textTarget) // minimum viable card
    .map((item) => {
      // Resolve category name(s)
      const catName = item.categoryId
        ? categories[item.categoryId]?.name
        : undefined;
      const baseTags = catName ? [catName] : [];
      const catPosition = item.categoryId
        ? categories[item.categoryId]?.position
        : undefined;

      // Infer word/phrase from textKnown
      const normalized = item.textKnown
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
      const tokenCount = normalized
        ? normalized.split(/\s+/).filter(Boolean).length
        : 1;
      const typeTag = tokenCount > 1 ? 'phrase' : 'word';
      const category = [...new Set([...baseTags, typeTag])];

      // Extract English from notes if stored as "en: ..."
      const enMatch = item.notes?.match(/^en:\s*(.+)$/);
      const en = enMatch ? enMatch[1] : '';

      // Map textKnown/textTarget to cz/vi based on user role
      // The system list has languageFrom=cz, languageTo=vi
      const cz = item.textKnown;
      const vi = item.textTarget!;
      const itemLanguageFrom = item.languageFrom;
      const itemLanguageTo = item.languageTo;
      const canUseLegacyMediaFallback =
        (!itemLanguageFrom && !itemLanguageTo) ||
        (normalizeListCode(itemLanguageFrom) === 'cs' &&
          normalizeListCode(itemLanguageTo) === 'vi');
      const media = canUseLegacyMediaFallback
        ? mediaByPair.get(pairKey(cz, vi)) ?? mediaByPair.get(pairKey(vi, cz))
        : undefined;
      // Prefer the app's /api/audio proxy. Some Arweave gateways expose
      // non-Ed25519 HTTP Signature headers that Chrome reports as
      // signature-based integrity issues; the proxy serves the same bytes
      // without forwarding those gateway-specific headers. Gateway URLs remain
      // as fallbacks if the proxy is unavailable.
      const generatedKnownAudio = [item.knownAudioUrl, ...(item.knownAudioArweaveUrls ?? [])]
        .filter((url): url is string => Boolean(url));
      const generatedTargetAudio = [item.audioUrl, ...(item.audioArweaveUrls ?? [])]
        .filter((url): url is string => Boolean(url));

      return {
        id: item.id, // UUID from word_list_items
        category,
        categoryPositions:
          catName && typeof catPosition === 'number' && Number.isFinite(catPosition)
            ? { [catName]: catPosition }
            : undefined,
        categoryId: item.categoryId ?? null,
        categoryKey:
          item.listId && item.categoryId ? `${item.listId}:${item.categoryId}` : catName ?? null,
        categorySourceName: item.listId ? opts?.listNamesById?.[item.listId] : undefined,
        listPosition: item.position,
        cz,
        en,
        vi,
        czPron: media?.czPron,
        viPron: media?.viPron,
        czAudio: stripLegacyLocalSpeechAudio(
          generatedKnownAudio.length > 0 ? generatedKnownAudio : media?.czAudio,
        ),
        viAudio: stripLegacyLocalSpeechAudio(
          generatedTargetAudio.length > 0 ? generatedTargetAudio : media?.viAudio,
        ),
        listId: item.listId,
        canonicalWordId: item.canonicalWordId ?? null,
        languageFrom: itemLanguageFrom,
        languageTo: itemLanguageTo,
        acceptedKnown: normalizeAcceptedAnswersForDisplay(item.acceptedKnown, item.textKnown),
        acceptedTarget: normalizeAcceptedAnswersForDisplay(item.acceptedTarget, item.textTarget),
        // Defensive normalization on hydrate: drop malformed/legacy comments.
        comment: normalizeWordItemComment(item.comment),
        addressForm: resolveAddressForm(item, addressItemsByGroup),
      } as NormalizedWord;
    });
}
