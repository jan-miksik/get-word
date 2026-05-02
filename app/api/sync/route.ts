import { NextRequest, NextResponse } from "next/server";
import {
  getUserByDeviceId,
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
  updateUserRole,
  updateUserPreferences,
  getSystemDefaultList,
  getWordIdToItemIdMapping,
  touchUserDevice,
  applyNewReviewEvents,
} from "@/lib/db";
import { type User } from "@/lib/db/schema";
import { withSessionCookie } from "@/features/shared/routes/session";
import { createRouteTimer } from "@/features/shared/routes/timing";
import { buildSyncSuccessPayload, getHydratedWordListData } from "@/features/shared/sync/response";
import { isUuid } from "@/features/shared/sync/identity";
import {
  verifySession,
  WORDLINK_SESSION_COOKIE_NAME,
} from "@/lib/session";
import { isGoogleSupportedLanguage } from "@/lib/i18n/server";

const PG_STATEMENT_TIMEOUT = "57014";

function isStatementTimeout(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === PG_STATEMENT_TIMEOUT || e?.cause?.code === PG_STATEMENT_TIMEOUT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetryOnTimeout<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isStatementTimeout(e)) {
      await sleep(800);
      return fn();
    }
    throw e;
  }
}

/** Prefers userId (PK lookup) when provided; falls back to deviceId get-or-create. */
async function resolveUser(
  deviceId: string | null,
  userId: string | null,
  sessionUserId: string | null
): Promise<User | null> {
  if (sessionUserId) {
    const sessionUser = await getUserById(sessionUserId);
    if (sessionUser) return sessionUser;
  }

  if (userId) {
    const user = await getUserById(userId);
    if (user) return user;
  }
  if (deviceId) return await getUserByDeviceId(deviceId);
  return null;
}

interface SyncRequest {
  deviceId?: string;
  sessionId?: string;
  userId?: string; // Optional: fallback user ID for recovery
  role?: "cz" | "vi";
  show_english?: boolean;
  show_category_badges?: boolean;
  show_pronunciation?: boolean;
  memory_hooks_enabled?: boolean;
  memory_hook_disable_from_stage?: number;
  settings_language?: string;
  language_from?: string | null;
  language_to?: string | null;
  onboarding_completed?: boolean;
  game_score?: number;
  category_order?: string[];
  progress?: Array<{
    word_id?: string; // legacy: old word ID like "w000"
    word_list_item_id?: string; // new: UUID from word_list_items
    stage_index: number;
    known_count: number;
    unknown_count: number;
    last_known_at: number | null;
    last_unknown_at: number | null;
    next_due_at: number | null;
  }>;
  review_events?: Array<{
    client_event_id: string;
    word_id?: string;
    word_list_item_id?: string;
    action: "known" | "really_known" | "unknown";
    client_created_at: number;
  }>;
  memory_hooks?: Record<string, string | null>; // null means delete
  category_filters?: string[];
}

export async function POST(request: NextRequest) {
  const timer = createRouteTimer();
  try {
    const sessionToken = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
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
    const body: SyncRequest = await request.json();
    timer.mark("parse_body");
    const {
      deviceId,
      sessionId,
      role,
      show_english,
      show_category_badges,
      show_pronunciation,
      memory_hooks_enabled,
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
    } = body;
    const userId = body.userId as string | undefined; // Optional compatibility hint from client

    if (!deviceId && !userId) {
      return NextResponse.json(
        { error: "deviceId or userId is required" },
        { status: 400 }
      );
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

    let user = await withRetryOnTimeout(() =>
      resolveUser(deviceId || null, userId || null, session.userId)
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

    // Update role if provided
    if (role && role !== user.role) {
      await updateUserRole(user.id, role);
    }

    // Update display preferences + game score if provided
    if (
      show_english !== undefined ||
      show_category_badges !== undefined ||
      show_pronunciation !== undefined ||
      memory_hooks_enabled !== undefined ||
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
        }));
        await batchUpsertProgress(progressData);
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
        }));
        await batchUpsertProgressByItemId(progressData);
      }
    }

    // Sync memory hooks
    if (memory_hooks) {
      const hasItemIdKeys = Object.keys(memory_hooks).some((k) => isUuid(k));
      let systemItemIdToWordId = new Map<string, string>();

      if (hasItemIdKeys) {
        const systemList = await getSystemDefaultList();
        if (systemList) {
          const wordIdToItemId = await getWordIdToItemIdMapping(systemList.id);
          systemItemIdToWordId = new Map(
            [...wordIdToItemId.entries()].map(([wordId, itemId]) => [itemId, wordId])
          );
        }
      }

      for (const [key, hookText] of Object.entries(memory_hooks)) {
        // Normalize hookText: treat non-null values as strings and trim
        const trimmed = hookText === null ? null : String(hookText).trim();
        const legacyWordId = isUuid(key) ? systemItemIdToWordId.get(key) : key;

        if (isUuid(key) && !legacyWordId) {
          if (trimmed === null || trimmed === "") {
            await deleteMemoryHookByItemId(user.id, key);
          } else {
            await upsertMemoryHookByItemId(user.id, key, trimmed);
          }
        } else if (legacyWordId) {
          if (trimmed === null || trimmed === "") {
            await deleteMemoryHook(user.id, legacyWordId);
          } else {
            await upsertMemoryHook(user.id, legacyWordId, trimmed);
          }
        } else {
          // Ignore malformed empty keys so one bad payload entry does not fail the sync.
          continue;
        }
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
    const response = await withSessionCookie(
      buildSyncSuccessPayload(
        { ...user, role: role ?? user.role },
        currentProgress,
        currentHooks,
        currentFilters,
        hydratedLists,
        {
          applied_review_event_ids: appliedReviewEventIds,
          sync_revision: Date.now(),
        }
      ),
      user.id,
      user.userRole
    );
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
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
    const sessionToken = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
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
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const userId = searchParams.get("userId"); // Optional: fallback user ID

    if (!deviceId && !userId) {
      return NextResponse.json(
        { success: false, error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    const user = await withRetryOnTimeout(() =>
      resolveUser(deviceId || null, userId || null, session.userId)
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
    const [progress, memoryHooks, categoryFilters] = await Promise.all([
      getUserProgress(user.id),
      getUserMemoryHooks(user.id),
      getUserCategoryFilters(user.id),
    ]);
    timer.mark("fetch_user_data");
    const hydratedLists = await getHydratedWordListData(user.id, memoryHooks);
    timer.mark("fetch_list_metadata");
    const response = await withSessionCookie(
      buildSyncSuccessPayload(
        user,
        progress,
        memoryHooks,
        categoryFilters,
        hydratedLists,
        { sync_revision: Date.now() }
      ),
      user.id,
      user.userRole
    );
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
    console.error("Fetch error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch data";
    const failed = NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
    return timer.applyHeaders(failed);
  }
}
