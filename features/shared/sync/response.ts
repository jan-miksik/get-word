import {
  getMediaAssetsByIds,
  getCategoriesForLists,
  getUserOwnListItems,
  getUserSubscribedItems,
  getUserStudyLists,
} from '@/lib/db';
import { getPlayableAudioFields } from '@/lib/audio-assets';
import {
  DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE,
} from '@/lib/words';

type HydratedWordListItems = Awaited<ReturnType<typeof getUserSubscribedItems>>;
type HydratedListNames = Awaited<ReturnType<typeof getUserStudyLists>>;
type HydratedWordListItemWithMedia = HydratedWordListItems[number] & {
  languageFrom: string;
  languageTo: string;
  knownAudioUrl: string | null;
  knownAudioArweaveUrl: string | null;
  knownAudioArweaveUrls: string[];
  knownAudioStorageRef: string | null;
  knownAudioCreatedAt: string | null;
  audioUrl: string | null;
  audioArweaveUrl: string | null;
  audioArweaveUrls: string[];
  audioStorageRef: string | null;
  audioCreatedAt: string | null;
};

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

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
      createdAt: null,
    };
  }

  return getPlayableAudioFields(mediaAssets.get(audioAssetId));
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
    knownAudioCreatedAt: known.createdAt,
    audioUrl: target.url,
    audioArweaveUrl: target.arweaveUrl,
    audioArweaveUrls: target.arweaveUrls,
    audioStorageRef: target.storageRef,
    audioCreatedAt: target.createdAt,
  };
}

type SyncUserShape = {
  id: string;
  userRole?: string | null;
  showEnglish: boolean | null;
  showCategoryBadges: boolean | null;
  showPronunciation?: boolean | null;
  memoryHooksEnabled?: boolean | null;
  memoryHooksIntroAnswered?: boolean | null;
  memoryHookDisableFromStage?: number | null;
  studyNotesEnabled?: boolean | null;
  studyNoteMinimizeFromStage?: number | null;
  settingsLanguage?: string | null;
  settingsLanguageSelectedAt?: Date | string | null;
  languageFrom?: string | null;
  languageTo?: string | null;
  onboardingCompletedAt?: Date | string | null;
  gameScore: number | null;
  categoryOrder?: string[] | null;
  pinnedCategoryIds?: string[] | null;
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
  const [subscribedItems, ownItems, listNameRows] = await Promise.all([
    getUserSubscribedItems(userId),
    getUserOwnListItems(userId),
    getUserStudyLists(userId),
  ]);
  const wordListItems = dedupeById([...subscribedItems, ...ownItems]);
  const listIds = [...new Set([
    ...wordListItems.map((item) => item.listId),
    ...listNameRows.map((list) => list.id),
  ])];
  const mediaAssetIds = wordListItems
    .flatMap((item) => [item.knownAudioAssetId, item.audioAssetId])
    .filter((id): id is string => Boolean(id));

  const [mediaAssets, allCategories] = await Promise.all([
    getMediaAssetsByIds(mediaAssetIds),
    getCategoriesForLists(listIds),
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
    rekeyedHooks: memoryHooks,
    wordListItems: hydratedWordListItems,
    categoryLookup,
    listNameRows,
  };
}

function buildSyncUser(user: SyncUserShape) {
  return {
    id: user.id,
    user_role: user.userRole ?? 'user',
    show_english: user.showEnglish ?? true,
    show_category_badges: user.showCategoryBadges ?? false,
    show_pronunciation: user.showPronunciation ?? false,
    memory_hooks_enabled: user.memoryHooksEnabled ?? true,
    memory_hooks_intro_answered: user.memoryHooksIntroAnswered ?? false,
    memory_hook_disable_from_stage:
      user.memoryHookDisableFromStage ?? DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
    study_notes_enabled: user.studyNotesEnabled ?? true,
    study_note_minimize_from_stage:
      user.studyNoteMinimizeFromStage ?? DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE,
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
    // Server-owned: set by a word-chat commit, read-only on the client.
    pinned_category_ids: user.pinnedCategoryIds ?? [],
    wallet_address: user.walletAddress ?? null,
    email: user.email ?? null,
    auth_provider: user.authProvider ?? null,
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
    user: buildSyncUser(user),
    progress,
    memory_hooks: hydratedLists.rekeyedHooks,
    category_filters: categoryFilters,
    word_list_items: hydratedLists.wordListItems,
    categories: hydratedLists.categoryLookup,
    lists: hydratedLists.listNameRows,
  };
}

/**
 * Minimal response for a conditional GET whose `since` and `contentRev`
 * cursors both match current server state: nothing to send, keep everything.
 * The user block stays included (SyncResponse requires it and it is tiny).
 */
export function buildSyncUnchangedPayload(
  user: SyncUserShape,
  extra: Record<string, unknown> = {}
) {
  return {
    ...extra,
    success: true,
    is_delta: true,
    unchanged: true,
    user: buildSyncUser(user),
  };
}

/**
 * Mutation acknowledgement only. It intentionally carries no sync cursor:
 * POST does not read and return concurrent server changes, so advancing the
 * client's GET cursor here could permanently skip fresher rows from another
 * device (or a server-side LWW winner).
 */
export function buildSyncAckPayload(
  user: SyncUserShape,
  extra: Record<string, unknown> = {}
) {
  return {
    ...extra,
    success: true,
    is_delta: true,
    user: buildSyncUser(user),
  };
}

/**
 * Delta variant for GET /api/sync?since=<cursor>. Returns only rows that
 * changed since the cursor plus the always-included tail (user prefs +
 * category_filters are tiny). Word list items, categories, and lists are
 * intentionally omitted — the client keeps its existing copies and only
 * re-fetches the full snapshot on cache invalidation.
 */
export function buildSyncDeltaPayload(
  user: SyncUserShape,
  progress: Record<string, unknown>,
  memoryHooksUpdated: Record<string, string>,
  memoryHooksDeleted: string[],
  categoryFilters: string[],
  extra: Record<string, unknown> = {}
) {
  return {
    ...extra,
    success: true,
    is_delta: true,
    user: buildSyncUser(user),
    progress,
    memory_hooks: memoryHooksUpdated,
    memory_hooks_deleted: memoryHooksDeleted,
    category_filters: categoryFilters,
  };
}
