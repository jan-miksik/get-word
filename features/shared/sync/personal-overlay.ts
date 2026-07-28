import { computeContentKey } from '@/lib/progress-key';

/**
 * Learning-only personal overlay. Exact current pairs are dynamically deduped;
 * explicit takeovers additionally hide their original source identity forever.
 * List detail/editor/export queries do not pass through this helper.
 */
export async function applyPersonalLearningOverlay<
  T extends {
    id: string;
    listId: string;
    textKnown: string;
    textTarget: string | null;
    ignoreCase: boolean;
    takeoverSourceItemId?: string | null;
  },
  L extends {
    id: string;
    languageFrom: string;
    languageTo: string;
    isPersonal?: boolean | null;
    isOwnedPersonal?: boolean | null;
  },
>(items: T[], lists: L[]): Promise<T[]> {
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const personalKeys = new Set<string>();
  const takeoverIds = new Set<string>();

  for (const item of items) {
    const list = listsById.get(item.listId);
    if (!list?.isOwnedPersonal) continue;
    const key = await computeContentKey({
      languageFrom: list.languageFrom,
      languageTo: list.languageTo,
      textKnown: item.textKnown,
      textTarget: item.textTarget,
      ignoreCase: item.ignoreCase,
    });
    if (key) personalKeys.add(key);
    if (item.takeoverSourceItemId) takeoverIds.add(item.takeoverSourceItemId);
  }

  const visible: T[] = [];
  for (const item of items) {
    const list = listsById.get(item.listId);
    if (list?.isOwnedPersonal) {
      visible.push(item);
      continue;
    }
    if (takeoverIds.has(item.id)) continue;
    if (!list) {
      visible.push(item);
      continue;
    }
    const key = await computeContentKey({
      languageFrom: list.languageFrom,
      languageTo: list.languageTo,
      textKnown: item.textKnown,
      textTarget: item.textTarget,
      ignoreCase: item.ignoreCase,
    });
    if (key && personalKeys.has(key)) continue;
    visible.push(item);
  }
  return visible;
}
