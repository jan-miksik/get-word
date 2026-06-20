import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUserByDeviceId,
  getUserById,
  getUserProgress,
  batchUpsertProgress,
  batchUpsertProgressByItemId,
  getUserMemoryHooks,
  upsertMemoryHook,
  upsertMemoryHookByItemId,
  deleteMemoryHook,
  deleteMemoryHookByItemId,
  getUserCategoryFilters,
  setUserCategoryFilters,
  updateUserPreferences,
  touchUserDevice,
  applyNewReviewEvents,
  getUserMemoryHooksDelta,
  getUserSyncRevision,
} from "@/lib/db";
import { type User } from "@/lib/db/schema";
import { withSessionCookie } from "@/features/shared/routes/session";
import { createRouteTimer } from "@/features/shared/routes/timing";
import {
  databaseUnavailableResponse,
  isTransientDatabaseError,
  withRetryOnRecoverableDatabaseError,
} from "@/features/shared/routes/database-retry";
import {
  buildSyncDeltaPayload,
  buildSyncSuccessPayload,
  getHydratedWordListData,
} from "@/features/shared/sync/response";
import { isUuid } from "@/features/shared/sync/identity";
import { parseSinceCursor } from "@/features/shared/sync/cursor";
import type { SyncRequest } from "@/features/sync/types";
import {
  GET_WORD_SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/session";
import { isGoogleSupportedLanguage } from "@/lib/i18n/server";

/** Prefers a verified session; otherwise bootstraps from device auth. */
async function resolveUser(
  deviceId: string | null,
  userId: string | null,
  sessionUserId: string | null
): Promise<User | null> {
  if (sessionUserId) {
    const sessionUser = await getUserById(sessionUserId);
    if (sessionUser) return sessionUser;

    if (userId) {
      const user = await getUserById(userId);
      if (user) return user;
    }
  }
  if (deviceId) return await getOrCreateUserByDeviceId(deviceId);
  return null;
}

function toFiniteDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value);
}

function getClientProgressUpdatedAt(progress: {
  client_updated_at?: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
}): Date {
  const explicit = toFiniteDate(progress.client_updated_at);
  if (explicit) return explicit;

  const inferred = Math.max(
    progress.last_known_at ?? 0,
    progress.last_unknown_at ?? 0
  );
  if (Number.isFinite(inferred) && inferred > 0) {
    return new Date(inferred);
  }

  // Missing timestamps are legacy/stale-client writes. Use the oldest possible
  // client write time so they can insert a missing row but cannot overwrite
  // fresher progress already produced by review events or another device.
  return new Date(0);
}

export async function POST(request: NextRequest) {
  const timer = createRouteTimer();
  try {
    const body: SyncRequest = await request.json();
    timer.mark("parse_body");
    const {
      deviceId,
      sessionId,
      show_english,
      show_category_badges,
      show_pronunciation,
      memory_hooks_enabled,
      memory_hooks_intro_answered,
      memory_hook_disable_from_stage,
      settings_language,
      language_from,
      language_to,
      onboarding_completed,
      game_score,
      category_order,
      progress,
      review_events,
      memory_hooks,
      category_filters,
      client_op_ids,
    } = body;
    const userId = body.userId as string | undefined; // Optional compatibility hint from client
    const clientOpIds = Array.isArray(client_op_ids)
      ? client_op_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (!deviceId && !userId) {
      return NextResponse.json(
        { error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    const sessionToken = request.cookies.get(GET_WORD_SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(sessionToken);
    timer.mark("verify_session");
    if (!session?.userId) {
      const unauthorized = NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
      timer.mark("return_unauthorized");
      return timer.applyHeaders(unauthorized);
    }

    if (settings_language !== undefined) {
      const supported = await isGoogleSupportedLanguage(settings_language).catch(() => false);
      if (!supported) {
        return NextResponse.json(
          { error: "settings_language must be supported by Google Translate" },
          { status: 400 }
        );
      }
    }
    for (const [field, value] of [
      ["language_from", language_from],
      ["language_to", language_to],
    ] as const) {
      if (value === undefined || value === null) continue;
      const supported = await isGoogleSupportedLanguage(value).catch(() => false);
      if (!supported) {
        return NextResponse.json(
          { error: `${field} must be supported by Google Translate` },
          { status: 400 }
        );
      }
    }

    let user = await withRetryOnRecoverableDatabaseError(() =>
      resolveUser(deviceId || null, userId || null, session?.userId ?? null)
    );
    timer.mark("resolve_user");
    if (!user) {
      const failed = NextResponse.json(
        { error: "Failed to get or create user" },
        { status: 500 }
      );
      timer.mark("return_user_error");
      return timer.applyHeaders(failed);
    }
    await touchUserDevice(user.id, deviceId);
    let appliedReviewEventIds: string[] = [];

    // Update display preferences + game score if provided
    if (
      show_english !== undefined ||
      show_category_badges !== undefined ||
      show_pronunciation !== undefined ||
      memory_hooks_enabled !== undefined ||
      memory_hooks_intro_answered !== undefined ||
      memory_hook_disable_from_stage !== undefined ||
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
        settings_language,
        language_from,
        language_to,
        onboarding_completed,
        game_score: game_score === undefined
          ? undefined
          : Math.max(user.gameScore ?? 0, game_score),
        category_order,
      });
      if (updated) user = updated;
    }

    if (review_events && review_events.length > 0) {
      appliedReviewEventIds = await applyNewReviewEvents({
        userId: user.id,
        deviceId,
        sessionId,
        events: review_events,
      });
    }

    // Sync progress — route to legacy (wordId) or new (wordListItemId) upsert
    if (progress && progress.length > 0) {
      const legacyProgress = progress.filter((p) => p.word_id && !p.word_list_item_id);
      const newProgress = progress.filter((p) => p.word_list_item_id);

      if (legacyProgress.length > 0) {
        const progressData = legacyProgress.map((p) => ({
          userId: user.id,
          wordId: p.word_id!,
          stageIndex: p.stage_index,
          knownCount: p.known_count,
          unknownCount: p.unknown_count,
          lastKnownAt: p.last_known_at ? new Date(p.last_known_at) : null,
          lastUnknownAt: p.last_unknown_at ? new Date(p.last_unknown_at) : null,
          nextDueAt: p.next_due_at ? new Date(p.next_due_at) : null,
          // Forward client-side wall time so batchUpsertProgress can enforce
          // LWW. Older queued ops infer from their review timestamps and fall
          // back to epoch so they cannot clobber fresher review-event writes.
          updatedAt: getClientProgressUpdatedAt(p),
        }));
        await batchUpsertProgress(progressData, undefined, { lww: true });
      }

      if (newProgress.length > 0) {
        const progressData = newProgress.map((p) => ({
          userId: user.id,
          wordListItemId: p.word_list_item_id!,
          stageIndex: p.stage_index,
          knownCount: p.known_count,
          unknownCount: p.unknown_count,
          lastKnownAt: p.last_known_at ? new Date(p.last_known_at) : null,
          lastUnknownAt: p.last_unknown_at ? new Date(p.last_unknown_at) : null,
          nextDueAt: p.next_due_at ? new Date(p.next_due_at) : null,
          updatedAt: getClientProgressUpdatedAt(p),
        }));
        await batchUpsertProgressByItemId(progressData, undefined, { lww: true });
      }
    }

    // Sync memory hooks. UUID keys are word_list_item ids (the canonical path);
    // any non-UUID key is a legacy word_id from old clients, stored as-is.
    if (memory_hooks) {
      for (const [key, hookText] of Object.entries(memory_hooks)) {
        // Normalize hookText: treat non-null values as strings and trim
        const trimmed = hookText === null ? null : String(hookText).trim();
        const isEmpty = trimmed === null || trimmed === "";

        if (isUuid(key)) {
          if (isEmpty) {
            await deleteMemoryHookByItemId(user.id, key);
          } else {
            await upsertMemoryHookByItemId(user.id, key, trimmed);
          }
        } else if (key) {
          if (isEmpty) {
            await deleteMemoryHook(user.id, key);
          } else {
            await upsertMemoryHook(user.id, key, trimmed);
          }
        }
        // Empty keys are ignored so one bad payload entry does not fail the sync.
      }
    }

    // Sync category filters
    if (category_filters !== undefined) {
      await setUserCategoryFilters(user.id, category_filters);
    }
    timer.mark("apply_mutations");

    // Fetch all current data to return
    const [currentProgress, currentHooks, currentFilters] = await Promise.all([
      getUserProgress(user.id),
      getUserMemoryHooks(user.id),
      getUserCategoryFilters(user.id),
    ]);
    timer.mark("fetch_user_data");
    const hydratedLists = await getHydratedWordListData(user.id, currentHooks);
    timer.mark("fetch_list_metadata");
    const syncRevision = await getUserSyncRevision(user.id);
    timer.mark("compute_sync_revision");
    const response = await withSessionCookie(
      buildSyncSuccessPayload(
        user,
        currentProgress,
        currentHooks,
        currentFilters,
        hydratedLists,
        {
          applied_review_event_ids: appliedReviewEventIds,
          applied_client_op_ids: clientOpIds,
          sync_revision: syncRevision,
        }
      ),
      user.id,
      user.userRole
    );
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
    if (isTransientDatabaseError(error)) {
      return databaseUnavailableResponse(timer, error, "Sync database unavailable:");
    }
    console.error("Sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to sync data";
    const failed = NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
    return timer.applyHeaders(failed);
  }
}

export async function GET(request: NextRequest) {
  const timer = createRouteTimer();
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const userId = searchParams.get("userId"); // Optional: fallback user ID
    const sinceParam = searchParams.get("since");
    const since = parseSinceCursor(sinceParam);

    if (!deviceId && !userId) {
      return NextResponse.json(
        { success: false, error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    const sessionToken = request.cookies.get(GET_WORD_SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(sessionToken);
    timer.mark("verify_session");
    if (!session?.userId) {
      const unauthorized = NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
      timer.mark("return_unauthorized");
      return timer.applyHeaders(unauthorized);
    }

    const user = await withRetryOnRecoverableDatabaseError(() =>
      resolveUser(deviceId || null, userId || null, session?.userId ?? null)
    );
    timer.mark("resolve_user");
    if (!user) {
      console.error("Failed to resolve user", { deviceId, userId });
      const failed = NextResponse.json(
        { success: false, error: "Failed to get or create user" },
        { status: 500 }
      );
      timer.mark("return_user_error");
      return timer.applyHeaders(failed);
    }
    await touchUserDevice(user.id, deviceId);

    if (since) {
      const [progress, hookDelta, categoryFilters] = await Promise.all([
        getUserProgress(user.id, { since }),
        getUserMemoryHooksDelta(user.id, since),
        getUserCategoryFilters(user.id),
      ]);
      timer.mark("fetch_user_data");

      const updated: Record<string, string> = {};
      const deleted: string[] = [];
      for (const row of hookDelta) {
        if (row.deletedAt) deleted.push(row.key);
        else updated[row.key] = row.hookText;
      }

      const syncRevision = await getUserSyncRevision(user.id);
      timer.mark("compute_sync_revision");
      const deltaResponse = await withSessionCookie(
        buildSyncDeltaPayload(
          user,
          progress,
          updated,
          deleted,
          categoryFilters,
          { sync_revision: syncRevision }
        ),
        user.id,
        user.userRole
      );
      timer.mark("build_response");
      return timer.applyHeaders(deltaResponse);
    }

    const [progress, memoryHooks, categoryFilters] = await Promise.all([
      getUserProgress(user.id),
      getUserMemoryHooks(user.id),
      getUserCategoryFilters(user.id),
    ]);
    timer.mark("fetch_user_data");
    const hydratedLists = await getHydratedWordListData(user.id, memoryHooks);
    timer.mark("fetch_list_metadata");
    const syncRevision = await getUserSyncRevision(user.id);
    timer.mark("compute_sync_revision");
    const response = await withSessionCookie(
      buildSyncSuccessPayload(
        user,
        progress,
        memoryHooks,
        categoryFilters,
        hydratedLists,
        { sync_revision: syncRevision }
      ),
      user.id,
      user.userRole
    );
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
    if (isTransientDatabaseError(error)) {
      return databaseUnavailableResponse(timer, error, "Fetch database unavailable:");
    }
    console.error("Fetch error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch data";
    const failed = NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
    return timer.applyHeaders(failed);
  }
}
