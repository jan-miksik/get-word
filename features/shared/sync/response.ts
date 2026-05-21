import {
  getMediaAssetsByIds,
  getCategoriesForLists,
  getSystemDefaultList,
  getUserOwnListItems,
  getUserSubscribedItems,
  getWordIdToItemIdMapping,
  getWordListsByIds,
} from '@/lib/db';
import { rekeyByItemId } from '@/features/shared/sync/identity';
import { getAudioUrl } from '@/lib/audio';
import { getArweaveGatewayUrls } from '@/lib/audio-storage';
import { DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE } from '@/lib/words';

type HydratedWordListItems = Awaited<ReturnType<typeof getUserSubscribedItems>>;
type HydratedListNames = Awaited<ReturnType<typeof getWordListsByIds>>;
type HydratedWordListItemWithMedia = HydratedWordListItems[number] & {
  languageFrom: string;
  languageTo: string;
  knownAudioUrl: string | null;
  knownAudioArweaveUrl: string | null;
  knownAudioArweaveUrls: string[];
  knownAudioStorageRef: string | null;
  audioUrl: string | null;
  audioArweaveUrl: string | null;
  audioArweaveUrls: string[];
  audioStorageRef: string | null;
};

function hydrateSingleAudioAsset(
  audioAssetId: string | null | undefined,
  mediaAssets: Awaited<ReturnType<typeof getMediaAssetsByIds>>,
) {
  if (!audioAssetId) {
    return {
      url: null,
      arweaveUrl: null,
      arweaveUrls: [] as string[],
      storageRef: null,
    };
  }

  const asset = mediaAssets.get(audioAssetId);
  if (!asset) {
    return {
      url: null,
      arweaveUrl: null,
      arweaveUrls: [] as string[],
      storageRef: null,
    };
  }

  const arweaveUrls =
    asset.storageType === 'arweave'
      ? getArweaveGatewayUrls(asset.storageRef)
      : [];

  return {
    url: getAudioUrl(asset.contentHash),
    arweaveUrl: arweaveUrls[0] ?? null,
    arweaveUrls,
    storageRef: asset.storageRef,
  };
}

function getHydratedAudioFields(
  knownAudioAssetId: string | null | undefined,
  targetAudioAssetId: string | null | undefined,
  mediaAssets: Awaited<ReturnType<typeof getMediaAssetsByIds>>,
) {
  const known = hydrateSingleAudioAsset(knownAudioAssetId, mediaAssets);
  const target = hydrateSingleAudioAsset(targetAudioAssetId, mediaAssets);

  return {
    knownAudioUrl: known.url,
    knownAudioArweaveUrl: known.arweaveUrl,
    knownAudioArweaveUrls: known.arweaveUrls,
    knownAudioStorageRef: known.storageRef,
    audioUrl: target.url,
    audioArweaveUrl: target.arweaveUrl,
    audioArweaveUrls: target.arweaveUrls,
    audioStorageRef: target.storageRef,
  };
}

type SyncUserShape = {
  id: string;
  role: string;
  userRole?: string | null;
  showEnglish: boolean | null;
  showCategoryBadges: boolean | null;
  showPronunciation?: boolean | null;
  memoryHooksEnabled?: boolean | null;
  memoryHookDisableFromStage?: number | null;
  settingsLanguage?: string | null;
  settingsLanguageSelectedAt?: Date | string | null;
  languageFrom?: string | null;
  languageTo?: string | null;
  onboardingCompletedAt?: Date | string | null;
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
  wordListItems: HydratedWordListItemWithMedia[];
  categoryLookup: Record<string, { name: string; position: number }>;
  listNameRows: HydratedListNames;
}> {
  const [subscribedItems, ownItems, systemList] = await Promise.all([
    getUserSubscribedItems(userId),
    getUserOwnListItems(userId),
    getSystemDefaultList(),
  ]);
  const wordListItems = [...subscribedItems, ...ownItems];
  const listIds = [...new Set(wordListItems.map((item) => item.listId))];
  const mediaAssetIds = wordListItems
    .flatMap((item) => [item.knownAudioAssetId, item.audioAssetId])
    .filter((id): id is string => Boolean(id));

  const [mediaAssets, allCategories, wordIdMapping, listNameRows] = await Promise.all([
    getMediaAssetsByIds(mediaAssetIds),
    getCategoriesForLists(listIds),
    systemList
      ? getWordIdToItemIdMapping(systemList.id)
      : Promise.resolve(new Map<string, string>()),
    getWordListsByIds(listIds),
  ]);

  const categoryLookup: Record<string, { name: string; position: number }> = {};
  for (const category of allCategories) {
    categoryLookup[category.id] = { name: category.name, position: category.position };
  }

  const listLanguageById = new Map(
    listNameRows.map((list) => [list.id, {
      languageFrom: list.languageFrom,
      languageTo: list.languageTo,
    }]),
  );

  const hydratedWordListItems = wordListItems.map((item) => {
    const listLanguages = listLanguageById.get(item.listId);
    return {
      ...item,
      languageFrom: listLanguages?.languageFrom ?? '',
      languageTo: listLanguages?.languageTo ?? '',
      ...getHydratedAudioFields(item.knownAudioAssetId, item.audioAssetId, mediaAssets),
    };
  });

  return {
    rekeyedHooks: rekeyByItemId(memoryHooks, wordIdMapping),
    wordListItems: hydratedWordListItems,
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
    wordListItems: HydratedWordListItemWithMedia[];
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
      memory_hook_disable_from_stage:
        user.memoryHookDisableFromStage ?? DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
      settings_language: user.settingsLanguage ?? null,
      settings_language_selected_at: user.settingsLanguageSelectedAt
        ? new Date(user.settingsLanguageSelectedAt).toISOString()
        : null,
      language_from: user.languageFrom ?? null,
      language_to: user.languageTo ?? null,
      onboarding_completed_at: user.onboardingCompletedAt
        ? new Date(user.onboardingCompletedAt).toISOString()
        : null,
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
