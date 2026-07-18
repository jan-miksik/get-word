import {
  getContentRevision,
  getProjectedProgress,
  getUserCategoryFilters,
  getUserItemIdentities,
  getUserMemoryHooks,
  getUserMemoryHooksDelta,
  getUserSyncRevision,
} from '@/lib/db';
import type { User } from '@/lib/db/schema';
import {
  buildSyncDeltaPayload,
  buildSyncSuccessPayload,
  buildSyncUnchangedPayload,
  getHydratedWordListData,
} from '@/features/shared/sync/response';

type TimingMark = 'compute_sync_revision' | 'fetch_user_data' | 'fetch_list_metadata';

export async function readSyncPayload(input: {
  user: User;
  since: Date | null;
  contentRev: string | null;
  mark?: (name: TimingMark) => void;
}) {
  const { user, since, contentRev, mark = () => undefined } = input;

  if (since && contentRev) {
    const [currentContentRev, syncRevision] = await Promise.all([
      getContentRevision(user.id),
      getUserSyncRevision(user.id),
    ]);
    mark('compute_sync_revision');

    if (currentContentRev === contentRev) {
      if (syncRevision <= since.getTime()) {
        return buildSyncUnchangedPayload(user, { sync_revision: syncRevision });
      }

      const [itemIdentities, hookDelta, categoryFilters] = await Promise.all([
        getUserItemIdentities(user.id),
        getUserMemoryHooksDelta(user.id, since),
        getUserCategoryFilters(user.id),
      ]);
      const progress = await getProjectedProgress(user.id, itemIdentities, { since });
      mark('fetch_user_data');

      const updated: Record<string, string> = {};
      const deleted: string[] = [];
      for (const row of hookDelta) {
        if (row.deletedAt) deleted.push(row.key);
        else updated[row.key] = row.hookText;
      }
      return buildSyncDeltaPayload(user, progress, updated, deleted, categoryFilters, {
        sync_revision: syncRevision,
      });
    }
  }

  const [syncRevision, contentRevision] = await Promise.all([
    getUserSyncRevision(user.id),
    getContentRevision(user.id),
  ]);
  mark('compute_sync_revision');
  const [memoryHooks, categoryFilters] = await Promise.all([
    getUserMemoryHooks(user.id),
    getUserCategoryFilters(user.id),
  ]);
  mark('fetch_user_data');
  const hydratedLists = await getHydratedWordListData(user.id, memoryHooks);
  const progress = await getProjectedProgress(user.id, hydratedLists.wordListItems);
  mark('fetch_list_metadata');
  return buildSyncSuccessPayload(user, progress, memoryHooks, categoryFilters, hydratedLists, {
    sync_revision: syncRevision,
    content_revision: contentRevision,
  });
}
