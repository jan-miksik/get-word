import {
  applyNewReviewEvents,
  batchUpsertProgress,
  batchUpsertProgressByContentKey,
  deleteMemoryHook,
  deleteMemoryHookByItemId,
  getContentKeysForItemIds,
  getAppliedSyncClientOpIds,
  getUserById,
  recordActivitySegmentsIfNew,
  recordAppliedSyncClientOpIds,
  setUserCategoryFilters,
  updateUserPreferences,
  recomputeUserDayStat,
  ensureDayGoalSnapshot,
  upsertMemoryHook,
  upsertMemoryHookByItemId,
} from '@/lib/db';
import type { User } from '@/lib/db/schema';
import { localDayKeyAt, normalizeIanaTimezone } from '@/lib/local-day';
import { isUuid } from '@/features/shared/sync/identity';
import type { SyncOperationResult, SyncProgressItem, SyncRequest } from '@/features/sync/types';

function toFiniteDate(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value);
}

function getClientProgressUpdatedAt(progress: SyncProgressItem): Date {
  const explicit = toFiniteDate(progress.client_updated_at);
  if (explicit) return explicit;
  const inferred = Math.max(progress.last_known_at ?? 0, progress.last_unknown_at ?? 0);
  if (Number.isFinite(inferred) && inferred > 0) return new Date(inferred);
  return new Date(0);
}

export async function applySyncMutations(input: {
  user: User;
  request: SyncRequest;
}): Promise<{
  user: User;
  appliedReviewEventIds: string[];
  clientOpIds: string[];
  opResults: SyncOperationResult[];
}> {
  let { user } = input;
  const body = input.request;
  const {
    deviceId,
    sessionId,
    show_english,
    show_category_badges,
    show_pronunciation,
    memory_hooks_enabled,
    memory_hooks_intro_answered,
    memory_hook_disable_from_stage,
    study_notes_enabled,
    study_note_minimize_from_stage,
    learning_fine_tune,
    study_goal,
    study_goal_base_revision,
    goal_reminder_enabled,
    goal_reminder_local_minutes,
    goal_reminder_intro_answered,
    goal_intro_answered,
    review_opt_in,
    ai_review_opt_in,
    settings_language,
    language_from,
    language_to,
    onboarding_completed,
    settings_language_selected_at,
    language_pair_selected_at,
    settings_language_base_revision,
    language_pair_base_revision,
    game_score,
    category_order,
    progress,
    review_events,
    activity_segments,
    memory_hooks,
    category_filters,
    client_op_ids,
  } = body;
  const clientOpIds = Array.isArray(client_op_ids)
    ? [...new Set(client_op_ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  const duplicateClientOpIds = await getAppliedSyncClientOpIds(user.id, clientOpIds);
  if (clientOpIds.length > 0 && duplicateClientOpIds.size === clientOpIds.length) {
    return {
      user,
      appliedReviewEventIds: [],
      clientOpIds,
      opResults: clientOpIds.map((clientOpId) => ({ clientOpId, status: 'duplicate' })),
    };
  }
  // A partially replayed batch (some ids already applied, some new) is applied
  // in full. The aggregate wire shape cannot subtract the replayed ids' effects
  // from the payload, but it does not need to: every domain below is
  // individually idempotent — progress upserts are last-write-wins, review
  // events dedupe on clientEventId, memory hooks and category filters are
  // replace-by-key, and game_score takes a max. Re-applying a duplicate is a
  // no-op. The revision-bearing preference writes are the one exception, and
  // their base-revision predicate arbitrates them on its own; a fully replayed
  // batch returns above without reaching them at all.

  if (study_goal !== undefined) {
    const { saveStudyGoal } = await import('@/lib/db/queries/study-goals');
    await saveStudyGoal(
      user.id,
      study_goal,
      study_goal_base_revision,
      study_goal.timezone ?? 'UTC',
    );
    const refreshed = await getUserById(user.id);
    if (refreshed) user = refreshed;
  }

  if (
    show_english !== undefined ||
    show_category_badges !== undefined ||
    show_pronunciation !== undefined ||
    memory_hooks_enabled !== undefined ||
    memory_hooks_intro_answered !== undefined ||
    memory_hook_disable_from_stage !== undefined ||
    study_notes_enabled !== undefined ||
    review_opt_in !== undefined ||
    ai_review_opt_in !== undefined ||
    study_note_minimize_from_stage !== undefined ||
    (learning_fine_tune !== undefined && study_goal === undefined) ||
    goal_reminder_enabled !== undefined ||
    goal_reminder_local_minutes !== undefined ||
    goal_reminder_intro_answered !== undefined ||
    goal_intro_answered !== undefined ||
    settings_language !== undefined ||
    language_from !== undefined ||
    language_to !== undefined ||
    onboarding_completed !== undefined ||
    game_score !== undefined ||
    category_order !== undefined
  ) {
    const updated = await updateUserPreferences(user.id, {
      show_english,
      show_category_badges,
      show_pronunciation,
      memory_hooks_enabled,
      memory_hooks_intro_answered,
      memory_hook_disable_from_stage,
      study_notes_enabled,
      study_note_minimize_from_stage,
      learning_fine_tune: study_goal === undefined ? learning_fine_tune : undefined,
      goal_reminder_enabled,
      goal_reminder_local_minutes,
      goal_reminder_intro_answered,
      goal_intro_answered,
      review_opt_in,
      ai_review_opt_in,
      settings_language,
      language_from,
      language_to,
      onboarding_completed,
      settings_language_selected_at,
      language_pair_selected_at,
      settings_language_base_revision,
      language_pair_base_revision,
      game_score: game_score === undefined ? undefined : Math.max(user.gameScore ?? 0, game_score),
      category_order,
    });
    if (updated) user = updated;
  }

  // Old/offline clients may not have sent a local key. Derive one server-side
  // rather than let that omission bypass the immutable day snapshot.
  const reviewEventsWithDay = review_events?.map((event) => ({
    ...event,
    local_day_key: event.local_day_key ?? localDayKeyAt(event.client_created_at, normalizeIanaTimezone(user.timezone)),
  }));

  // A goal target is claimed before either an activity segment or an answer is
  // persisted. This makes concurrent devices converge on the same daily budget.
  const snapshotDayKeys = new Set<string>();
  for (const event of reviewEventsWithDay ?? []) if (event.local_day_key) snapshotDayKeys.add(event.local_day_key);
  for (const segment of activity_segments ?? []) if (segment.local_day_key) snapshotDayKeys.add(segment.local_day_key);
  const snapshotTimezone = normalizeIanaTimezone(
    activity_segments?.find((segment) => segment.timezone_at_creation)?.timezone_at_creation ?? user.timezone,
  );
  const snapshotEntries = await Promise.all([...snapshotDayKeys].map(async (dayKey) => [
    dayKey,
    await ensureDayGoalSnapshot(user.id, dayKey, snapshotTimezone),
  ] as const));
  const snapshotsByDay = new Map(snapshotEntries);

  let appliedReviewEventIds: string[] = [];
  if (reviewEventsWithDay && reviewEventsWithDay.length > 0) {
    appliedReviewEventIds = await applyNewReviewEvents({
      userId: user.id,
      deviceId,
      sessionId,
      events: reviewEventsWithDay,
      snapshotsByDay,
    });
  }

  // Ops the request carried but the server did not store. They are reported
  // back as 'retry' instead of being acknowledged, so the client keeps them.
  const unstoredClientOpIds = new Set<string>();

  if (activity_segments && activity_segments.length > 0) {
    // Measurement only: nothing downstream depends on it, so a failure here
    // must not cost the user their progress writes in the same batch. It must
    // not be reported as success either — an acknowledged op is deleted from
    // the outbox, and the expected failure here is a deploy that ran ahead of
    // migration 0061, which resolves on its own within minutes.
    try {
      await recordActivitySegmentsIfNew({
        userId: user.id,
        deviceId,
        segments: activity_segments,
      });
    } catch (error) {
      console.error('[sync] failed to record activity segments:', error);
      // A segment is queued under its own id, so these are exactly the ops that
      // carried the segments — every other domain in the batch still acks.
      for (const segment of activity_segments) {
        unstoredClientOpIds.add(segment.client_segment_id);
      }
    }
  }

  // Rollups are derived data: a failed refresh must never reject study
  // progress. The summary endpoint repeats this work for stale recent days.
  const affectedDayKeys = new Set<string>();
  for (const event of reviewEventsWithDay ?? []) {
    if (event.local_day_key) affectedDayKeys.add(event.local_day_key);
  }
  for (const segment of activity_segments ?? []) {
    if (segment.local_day_key) affectedDayKeys.add(segment.local_day_key);
  }
  if (affectedDayKeys.size > 0) {
    const timezone = normalizeIanaTimezone(
      activity_segments?.find((segment) => segment.timezone_at_creation)
        ?.timezone_at_creation ?? user.timezone,
    );
    try {
      await Promise.all([...affectedDayKeys].map((dayKey) =>
        recomputeUserDayStat(user.id, dayKey, timezone),
      ));
    } catch (error) {
      console.error('[sync] failed to recompute goal day stats:', error);
    }
  }

  if (progress && progress.length > 0) {
    const legacyProgress = progress.filter((row) => row.word_id && !row.word_list_item_id);
    const itemProgress = progress.filter((row) => row.word_list_item_id);

    if (legacyProgress.length > 0) {
      await batchUpsertProgress(
        legacyProgress.map((row) => ({
          userId: user.id,
          wordId: row.word_id!,
          stageIndex: row.stage_index,
          knownCount: row.known_count,
          unknownCount: row.unknown_count,
          lastKnownAt: row.last_known_at ? new Date(row.last_known_at) : null,
          lastUnknownAt: row.last_unknown_at ? new Date(row.last_unknown_at) : null,
          nextDueAt: row.next_due_at ? new Date(row.next_due_at) : null,
          updatedAt: getClientProgressUpdatedAt(row),
        })),
        undefined,
        { lww: true },
      );
    }

    if (itemProgress.length > 0) {
      const contentKeys = await getContentKeysForItemIds(
        itemProgress.map((row) => row.word_list_item_id!),
      );
      const rows = itemProgress
        .map((row) => {
          const contentKey = contentKeys.get(row.word_list_item_id!) ?? null;
          if (!contentKey) return null;
          return {
            userId: user.id,
            wordListItemId: row.word_list_item_id!,
            contentKey,
            stageIndex: row.stage_index,
            knownCount: row.known_count,
            unknownCount: row.unknown_count,
            lastKnownAt: row.last_known_at ? new Date(row.last_known_at) : null,
            lastUnknownAt: row.last_unknown_at ? new Date(row.last_unknown_at) : null,
            nextDueAt: row.next_due_at ? new Date(row.next_due_at) : null,
            updatedAt: getClientProgressUpdatedAt(row),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      await batchUpsertProgressByContentKey(rows, undefined, { lww: true });
    }
  }

  if (memory_hooks) {
    for (const [key, hookText] of Object.entries(memory_hooks)) {
      const trimmed = hookText === null ? null : String(hookText).trim();
      const isEmpty = trimmed === null || trimmed === '';
      if (isUuid(key)) {
        if (isEmpty) await deleteMemoryHookByItemId(user.id, key);
        else await upsertMemoryHookByItemId(user.id, key, trimmed);
      } else if (key) {
        if (isEmpty) await deleteMemoryHook(user.id, key);
        else await upsertMemoryHook(user.id, key, trimmed);
      }
    }
  }

  if (category_filters !== undefined) {
    await setUserCategoryFilters(user.id, category_filters);
  }

  const newClientOpIds = clientOpIds.filter(
    (id) => !duplicateClientOpIds.has(id) && !unstoredClientOpIds.has(id),
  );
  await recordAppliedSyncClientOpIds(user.id, newClientOpIds);
  return {
    user,
    appliedReviewEventIds,
    // The ack hint lists only what the client may forget; the per-op results
    // below still mention the rest so it knows to send them again.
    clientOpIds: clientOpIds.filter((id) => !unstoredClientOpIds.has(id)),
    opResults: clientOpIds.map((clientOpId) => ({
      clientOpId,
      status: unstoredClientOpIds.has(clientOpId)
        ? 'retry'
        : duplicateClientOpIds.has(clientOpId)
          ? 'duplicate'
          : 'applied',
    })),
  };
}
