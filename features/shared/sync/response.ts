import {
  getListCategories,
  getSystemDefaultList,
  getUserOwnListItems,
  getUserSubscribedItems,
  getWordIdToItemIdMapping,
  getWordListsByIds,
} from '@/lib/db';
import { rekeyByItemId } from '@/features/shared/sync/identity';

type HydratedWordListItems = Awaited<ReturnType<typeof getUserSubscribedItems>>;
type HydratedListNames = Awaited<ReturnType<typeof getWordListsByIds>>;

type SyncUserShape = {
  id: string;
  role: string;
  userRole?: string | null;
  showEnglish: boolean | null;
  showCategoryBadges: boolean | null;
  showPronunciation?: boolean | null;
  memoryHooksEnabled?: boolean | null;
  memoryHookDisableFromStage?: number | null;
  gameScore: number | null;
  categoryOrder?: string[] | null;
  walletAddress: string | null;
  email: string | null;
  authProvider: string | null;
};

export async function getHydratedWordListData(
  userId: string,
  memoryHooks: Record<string, string>
): Promise<{
  rekeyedHooks: Record<string, string>;
  wordListItems: HydratedWordListItems;
  categoryLookup: Record<string, { name: string; position: number }>;
  listNameRows: HydratedListNames;
}> {
  const [subscribedItems, ownItems] = await Promise.all([
    getUserSubscribedItems(userId),
    getUserOwnListItems(userId),
  ]);
  const wordListItems = [...subscribedItems, ...ownItems];
  const listIds = [...new Set(wordListItems.map((item) => item.listId))];

  const systemList = await getSystemDefaultList();
  const [categoryResults, wordIdMapping, listNameRows] = await Promise.all([
    Promise.all(listIds.map((id) => getListCategories(id))),
    systemList
      ? getWordIdToItemIdMapping(systemList.id)
      : Promise.resolve(new Map<string, string>()),
    getWordListsByIds(listIds),
  ]);

  const categoryLookup: Record<string, { name: string; position: number }> = {};
  for (const categories of categoryResults) {
    for (const category of categories) {
      categoryLookup[category.id] = { name: category.name, position: category.position };
    }
  }

  return {
    rekeyedHooks: rekeyByItemId(memoryHooks, wordIdMapping),
    wordListItems,
    categoryLookup,
    listNameRows,
  };
}

export function buildSyncSuccessPayload(
  user: SyncUserShape,
  progress: Record<string, unknown>,
  memoryHooks: Record<string, string>,
  categoryFilters: string[],
  hydratedLists: {
    rekeyedHooks: Record<string, string>;
    wordListItems: HydratedWordListItems;
    categoryLookup: Record<string, { name: string; position: number }>;
    listNameRows: HydratedListNames;
  },
  extra: Record<string, unknown> = {}
) {
  return {
    ...extra,
    success: true,
    user: {
      id: user.id,
      role: user.role,
      user_role: user.userRole ?? 'user',
      show_english: user.showEnglish ?? true,
      show_category_badges: user.showCategoryBadges ?? false,
      show_pronunciation: user.showPronunciation ?? false,
      memory_hooks_enabled: user.memoryHooksEnabled ?? true,
      memory_hook_disable_from_stage: user.memoryHookDisableFromStage ?? 8,
      game_score: user.gameScore ?? 0,
      category_order: user.categoryOrder ?? [],
      wallet_address: user.walletAddress ?? null,
      email: user.email ?? null,
      auth_provider: user.authProvider ?? null,
    },
    progress,
    memory_hooks: hydratedLists.rekeyedHooks,
    category_filters: categoryFilters,
    word_list_items: hydratedLists.wordListItems,
    categories: hydratedLists.categoryLookup,
    lists: hydratedLists.listNameRows,
  };
}
