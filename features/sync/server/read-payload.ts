import {
  getContentRevision,
  getProjectedProgress,
  getUserCategoryFilters,
  getUserItemIdentities,
  getUserMemoryHooks,
  getUserMemoryHooksDelta,
  getUserSurveyResponses,
  getUserSyncRevision,
} from '@/lib/db';
import type { User } from '@/lib/db/schema';
import { buildSurveyEligibility } from '@/packages/domain/surveys/eligibility';
import { LOWEST_SURVEY_THRESHOLD } from '@/packages/domain/surveys/spec';
import {
  buildSyncDeltaPayload,
  buildSyncSuccessPayload,
  buildSyncUnchangedPayload,
  getHydratedWordListData,
} from '@/features/shared/sync/response';

type TimingMark = 'compute_sync_revision' | 'fetch_user_data' | 'fetch_list_metadata';

function toWireSurveyResponses(
  responses: Awaited<ReturnType<typeof getUserSurveyResponses>>,
) {
  return Object.fromEntries(
    Object.entries(responses).map(([surveyId, value]) => [
      surveyId,
      { choice: value.choice, free_text: value.freeText, dismissed: value.dismissed },
    ]),
  );
}

/**
 * No survey can be shown before the lowest threshold, so below it the read is
 * a guaranteed-empty round-trip on the app's hottest endpoint. Skipped rather
 * than sent as `{}`: an omitted field means "no news" to the client, while an
 * empty object is an authoritative "you have answered nothing".
 */
function readSurveyResponses(user: User) {
  if ((user.surveyProgressCount ?? 0) < LOWEST_SURVEY_THRESHOLD) return Promise.resolve(null);
  return getUserSurveyResponses(user.id);
}

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

      const [itemIdentities, hookDelta, categoryFilters, surveyResponses] = await Promise.all([
        getUserItemIdentities(user.id),
        getUserMemoryHooksDelta(user.id, since),
        getUserCategoryFilters(user.id),
        // Always sent in full — bounded (a handful of survey definitions,
        // ever), so a delta variant isn't worth the extra complexity.
        readSurveyResponses(user),
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
        ...(surveyResponses && { survey_responses: toWireSurveyResponses(surveyResponses) }),
        survey_eligibility: buildSurveyEligibility(user),
      });
    }
  }

  const [syncRevision, contentRevision] = await Promise.all([
    getUserSyncRevision(user.id),
    getContentRevision(user.id),
  ]);
  mark('compute_sync_revision');
  const [memoryHooks, categoryFilters, surveyResponses] = await Promise.all([
    getUserMemoryHooks(user.id),
    getUserCategoryFilters(user.id),
    readSurveyResponses(user),
  ]);
  mark('fetch_user_data');
  const hydratedLists = await getHydratedWordListData(user.id, memoryHooks);
  const progress = await getProjectedProgress(user.id, hydratedLists.wordListItems);
  mark('fetch_list_metadata');
  return buildSyncSuccessPayload(user, progress, memoryHooks, categoryFilters, hydratedLists, {
    sync_revision: syncRevision,
    content_revision: contentRevision,
    ...(surveyResponses && { survey_responses: toWireSurveyResponses(surveyResponses) }),
    survey_eligibility: buildSurveyEligibility(user),
  });
}
